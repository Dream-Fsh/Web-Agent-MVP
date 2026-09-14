const target = document.getElementById('tab');
const status = document.querySelector('[role="status"]');
chrome.tabs.query({}).then(tabs => {
  for (const tab of tabs) {
    if (!/^https?:/.test(tab.url ?? '')) continue;
    const url = new URL(tab.url);
    const option = new Option(url.origin + url.pathname, String(tab.id));
    option.selected = tab.active;
    target.add(option);
  }
});
document.getElementById('pair').addEventListener('submit', async event => {
  event.preventDefault();
  if (!event.isTrusted) return;
  const input = document.getElementById('capability');
  try {
    const response = await chrome.runtime.sendMessage({ scope: 'recorder-ui', kind: 'connect', tabId: Number(target.value), endpoint: document.getElementById('endpoint').value, capability: input.value });
    status.textContent = response?.connected ? '保存服务：已连接' : `连接失败：${response?.error ?? '请检查服务和配对码'}`;
  } catch { status.textContent = '连接失败，请检查服务和配对码'; }
  finally { input.value = ''; }
});
