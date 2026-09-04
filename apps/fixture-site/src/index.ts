import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

export interface FixtureServer {
  baseUrl: string;
  close: () => Promise<void>;
}

let dynamicIndex = 0;
const dynamicClasses = ["btn-a12", "btn-z83", "btn-k55"];

function document(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function rtaPage(url: URL, route = "/rta"): string {
  const accountId = escapeHtml(url.searchParams.get("accountId") ?? "");
  const currentPage = Number(url.searchParams.get("page") ?? "1");
  const first = (currentPage - 1) * 10 + 1;
  const rows = Array.from({ length: 10 }, (_, index) => {
    const number = String(first + index).padStart(3, "0");
    return `<tr><td>RTA${number}</td><td>策略 ${number}</td><td>${index % 2 === 0 ? "生效中" : "已暂停"}</td></tr>`;
  }).join("");
  const result = accountId ? `<p role="status">账户 ${accountId} 的查询结果</p>` : "";
  const next = currentPage < 2 ? `<a rel="next" href="${route}?page=${currentPage + 1}">下一页</a>` : "";
  return document("RTA 策略", `<label>账户ID <input name="accountId" value="${accountId}"></label><button type="button" role="button">查询</button>${result}<table><thead><tr><th>策略ID</th><th>策略名称</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table><nav aria-label="分页"><a href="${route}?page=1">第 1 页</a><a href="${route}?page=2">第 2 页</a>${next}</nav>`);
}

function ajaxPaginationPage(): string {
  const rows = Array.from({ length:10 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return `<tr><td>RTA${number}</td><td>策略 ${number}</td><td>${index % 2 === 0 ? "生效中" : "已暂停"}</td></tr>`;
  }).join("");
  return document("AJAX RTA 策略", `<table><thead><tr><th>策略ID</th><th>策略名称</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table><nav aria-label="分页"><button rel="next" type="button">下一页</button></nav><script>document.querySelector('button[rel="next"]').addEventListener("click",(event)=>{document.querySelector("tbody").innerHTML=Array.from({length:10},(_,index)=>{const number=String(index+11).padStart(3,"0");return '<tr><td>RTA'+number+'</td><td>策略 '+number+'</td><td>'+((index%2===0)?"生效中":"已暂停")+"</td></tr>"}).join("");event.currentTarget.remove()})</script>`);
}

function render(url: URL): string {
  switch (url.pathname) {
    case "/login": return document("登录", '<label>用户名 <input name="username"></label><label>密码 <input type="password" name="password"></label><button type="button">登录</button>');
    case "/dashboard": return document("广告后台", '<a href="/rta">RTA 策略</a><a href="/dynamic">动态定位器</a>');
    case "/rta": return rtaPage(url);
    case "/dynamic": {
      const className = dynamicClasses[dynamicIndex++ % dynamicClasses.length];
      return document("动态 CSS", `<button class="${className}" data-testid="query" type="button" role="button" aria-label="查询">查询</button>`);
    }
    case "/duplicate-buttons": return document("重复查询按钮", '<button>查询账户</button><button>查询广告</button><button>查询计划</button><button>查询</button><button>查询</button>');
    case "/pagination": return rtaPage(url, "/pagination");
    case "/ajax-pagination": return ajaxPaginationPage();
    case "/pagination-ambiguous": return document("歧义分页", `${rtaPage(url, "/pagination-ambiguous").replace(/^.*<main>|<\/main>.*$/g, "")}<a rel="next" href="/pagination-ambiguous?page=2">备用下一页</a>`);
    case "/modal": return document("模态窗", '<button id="open-filter">打开筛选弹窗</button><dialog id="filter"><p>筛选条件</p><button id="close-filter">关闭</button></dialog><script>const openFilter=document.querySelector("#open-filter");const closeFilter=document.querySelector("#close-filter");const filter=document.querySelector("#filter");openFilter.addEventListener("click",()=>filter.showModal());closeFilter.addEventListener("click",()=>filter.close())</script>');
    case "/spa": return document("SPA", '<button id="go">打开详情</button><p id="view">列表</p><script>go.onclick=()=>{history.pushState({},"","/spa/detail");view.textContent="详情"}</script>');
    case "/iframe": return document("Iframe", '<iframe title="账户选择器" src="/iframe-content"></iframe>');
    case "/iframe-content": return document("账户选择器", '<button type="button">选择账户</button>');
    case "/nested-iframe": return document("嵌套 Iframe", '<iframe title="外层 frame" src="/iframe"></iframe>');
    case "/virtual-table": return document("虚拟表格", '<div data-virtualized="true" role="grid" aria-rowcount="100"><div role="row">当前可见行</div></div>');
    case "/write-actions": return document("写操作", '<button>保存</button><button>修改预算</button><button>暂停广告</button><button>删除广告</button><button>支付</button>');
    default: return document("未找到", '<a href="/dashboard">返回后台</a>');
  }
}

export async function startFixtureServer(port = 0): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const isKnownRoute = ["/login", "/dashboard", "/rta", "/dynamic", "/duplicate-buttons", "/pagination", "/ajax-pagination", "/pagination-ambiguous", "/modal", "/spa", "/iframe", "/iframe-content", "/nested-iframe", "/virtual-table", "/write-actions"].includes(url.pathname);
    response.writeHead(isKnownRoute ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    response.end(render(url));
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startFixtureServer(Number(process.env.PORT ?? 4173));
  console.log(`Fixture site listening at ${server.baseUrl}`);
}
