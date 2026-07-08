import pkg from '/tmp/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:8000';
const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}: ${name}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// 追踪所有模型/聊天请求的真实 URL
const requestUrls = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('/models') || url.includes('/chat/completions')) {
    requestUrls.push(url);
  }
});

// 统一拦截 /v1/models
await page.route('**/v1/models', async (route) => {
  const url = route.request().url();
  if (url.includes('nonstandard')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ foo: ['model-a'] })
    });
  }
  if (url.includes('/v1/v1/')) {
    return route.fulfill({ status: 500, body: 'double v1' });
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      object: 'list',
      data: [
        { id: 'gpt-4o', object: 'model' },
        { id: 'gpt-3.5-turbo', object: 'model' }
      ]
    })
  });
});

// 拦截 /v1/chat/completions（测试连接用）
await page.route('**/v1/chat/completions', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: 'hi' } }] })
  });
});

await page.goto(BASE);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

await page.click('[data-app-id="settings"]');
await page.waitForTimeout(800);
await page.click('#st-entry-api');
await page.waitForTimeout(500);

// 1. 粘贴/填入完整 key
const testUrl = 'https://mock-api.example.com';
const testKey = 'sk-paste-test-key-12345';
await page.fill('#st-api-url', testUrl);
await page.fill('#st-api-key', testKey);
check('Key 输入框可写入完整 key', (await page.inputValue('#st-api-key')) === testKey);

// 2. 拉取模型列表（Base URL 不带 /v1）
await page.click('#st-api-fetch-models');
await page.waitForTimeout(800);

const modelListVisible = await page.locator('#st-model-list').isVisible();
check('模型列表区域显示', modelListVisible);

const chips = await page.locator('.st-model-chip').allTextContents();
check('模型列表包含 gpt-4o', chips.includes('gpt-4o'));
check('模型列表包含 gpt-3.5-turbo', chips.includes('gpt-3.5-turbo'));
check('拉模型请求发到 /v1/models', requestUrls.some(u => u === 'https://mock-api.example.com/v1/models'));

// 3. 选择模型后自动填入
await page.click('.st-model-chip[data-model="gpt-4o"]');
const modelValue = await page.inputValue('#st-api-model');
check('点击模型后模型名自动填入', modelValue === 'gpt-4o');

// 4. 保存配置
await page.click('#st-api-save');
await page.waitForTimeout(600);

const apiGroups = await page.evaluate(() => localStorage.getItem('api_groups'));
if (apiGroups) {
  const parsed = JSON.parse(apiGroups);
  const defaultGroup = Array.isArray(parsed) ? parsed.find(g => g.id === 'default') : null;
  check('默认分组 apiKey 是完整粘贴值', defaultGroup?.apiKey === testKey);
  check('默认分组 baseURL 保存原值', defaultGroup?.baseURL === testUrl);
  check('默认分组 model 是选中模型', defaultGroup?.model === 'gpt-4o');
}

// 5. 刷新后恢复且不明文暴露 key
await page.reload();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);
await page.click('[data-app-id="settings"]');
await page.waitForTimeout(800);
await page.click('#st-entry-api');
await page.waitForTimeout(500);

const restoredUrl = await page.inputValue('#st-api-url');
const restoredModel = await page.inputValue('#st-api-model');
const keyStatus = await page.textContent('#st-key-status');
const restoredKey = await page.inputValue('#st-api-key');
check('刷新后 baseURL 恢复', restoredUrl === testUrl);
check('刷新后 model 恢复', restoredModel === 'gpt-4o');
check('刷新后 Key 状态显示已保存', keyStatus === '已保存');
check('刷新后 Key 输入框不明文暴露', restoredKey === '');

// 6. Base URL 带 /v1 时不重复拼接
requestUrls.length = 0;
await page.fill('#st-api-url', 'https://mock-api.example.com/v1');
await page.fill('#st-api-key', testKey);
await page.click('#st-api-fetch-models');
await page.waitForTimeout(800);

check('带 /v1 的地址不会拼成 /v1/v1', !requestUrls.some(u => u.includes('/v1/v1')));
check('带 /v1 的地址正确请求 /v1/models', requestUrls.some(u => u === 'https://mock-api.example.com/v1/models'));

// 7. 测试连接与拉模型使用同一套 URL 规范化
requestUrls.length = 0;
await page.fill('#st-api-url', 'https://mock-api.example.com');
await page.fill('#st-api-model', 'gpt-4o');
await page.click('#st-api-test');
await page.waitForTimeout(800);

check('测试连接请求发到 /v1/chat/completions', requestUrls.some(u => u === 'https://mock-api.example.com/v1/chat/completions'));

// 8. 非标准接口返回明确错误
requestUrls.length = 0;
await page.fill('#st-api-url', 'https://nonstandard.example.com');
await page.fill('#st-api-key', testKey);
await page.click('#st-api-fetch-models');
await page.waitForTimeout(800);

const statusText = await page.textContent('#st-api-status');
check('非标准格式显示明确错误', statusText.includes('不像标准 OpenAI 兼容格式'));

console.log('\n=== 结果: ' + results.filter(r => r.pass).length + ' 通过 / ' + results.filter(r => !r.pass).length + ' 失败 ===');
await browser.close();
process.exit(results.every(r => r.pass) ? 0 : 1);
