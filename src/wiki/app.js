import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWikiSite, getWikiPaths } from "./site-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, "static");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSidebar(site, currentSlug) {
  return site.groups
    .map((group) => {
      const links = group.pages
        .map((page) => {
          const className = page.slug === currentSlug ? "nav-link is-active" : "nav-link";
          return `<a class="${className}" href="/pages/${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a>`;
        })
        .join("");

      return `
        <section class="nav-group">
          <h2>${escapeHtml(group.title)}</h2>
          ${links}
        </section>
      `;
    })
    .join("");
}

function renderBreadcrumbs(page) {
  return `
    <nav class="breadcrumb" aria-label="面包屑">
      <a href="/">首页</a>
      <span>/</span>
      <span>${escapeHtml(page.groupTitle)}</span>
      <span>/</span>
      <span>${escapeHtml(page.title)}</span>
    </nav>
  `;
}

function renderHeadingLinks(page) {
  if (!page.headings?.length) {
    return "";
  }

  const links = page.headings
    .filter((heading) => heading.level <= 2)
    .map((heading) => `<a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>`)
    .join("");

  return `
    <section class="aside-card">
      <h3>页内导航</h3>
      <div class="aside-links">${links}</div>
    </section>
  `;
}

function renderRelatedPages(page) {
  if (!page.relatedPages?.length) {
    return "";
  }

  return `
    <section class="aside-card">
      <h3>相关页面</h3>
      <div class="related-list">
        ${page.relatedPages
          .map(
            (related) => `
              <a class="related-card" href="/pages/${escapeHtml(related.slug)}">
                <strong>${escapeHtml(related.title)}</strong>
                <span>${escapeHtml(related.summary)}</span>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderPagination(page) {
  const links = [];
  if (page.prevPage) {
    links.push(`
      <a class="pager-link" href="/pages/${escapeHtml(page.prevPage.slug)}">
        <span>上一篇</span>
        <strong>${escapeHtml(page.prevPage.title)}</strong>
      </a>
    `);
  }
  if (page.nextPage) {
    links.push(`
      <a class="pager-link" href="/pages/${escapeHtml(page.nextPage.slug)}">
        <span>下一篇</span>
        <strong>${escapeHtml(page.nextPage.title)}</strong>
      </a>
    `);
  }
  if (links.length === 0) {
    return "";
  }
  return `<section class="pager">${links.join("")}</section>`;
}

function renderFeaturedPages(site) {
  if (!site.site.featuredPages?.length) {
    return "";
  }

  return `
    <section class="featured-panel">
      <div class="section-heading">
        <h2>推荐阅读路径</h2>
        <p>如果你是第一次接触这套系统，可以按这个顺序阅读。</p>
      </div>
      <div class="featured-grid">
        ${site.site.featuredPages
          .map(
            (page, index) => `
              <a class="featured-card" href="/pages/${escapeHtml(page.slug)}">
                <span class="featured-step">STEP ${index + 1}</span>
                <strong>${escapeHtml(page.title)}</strong>
                <p>${escapeHtml(page.summary)}</p>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderWikiPage(site, page) {
  const isHome = page.slug === site.site.homePage?.slug;
  const title = isHome ? site.site.title : `${page.title} - ${site.site.title}`;

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <link rel="stylesheet" href="/static/wiki.css" />
    </head>
    <body>
      <div class="wiki-shell">
        <aside class="wiki-sidebar">
          <a class="brand" href="/">
            <span class="brand-kicker">User Wiki</span>
            <strong>${escapeHtml(site.site.title)}</strong>
          </a>
          <p class="brand-summary">${escapeHtml(site.site.summary)}</p>
          ${renderSidebar(site, page.slug)}
        </aside>
        <div class="wiki-main">
          <header class="page-header">
            ${isHome ? "" : renderBreadcrumbs(page)}
            <div class="page-chip-row">
              <span class="page-chip">${escapeHtml(page.audience || "系统使用者")}</span>
              <span class="page-chip">${escapeHtml(page.status || "stable")}</span>
              <span class="page-chip">人工确认：${escapeHtml(page.lastReviewed || "未填写")}</span>
            </div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="page-summary">${escapeHtml(page.summary)}</p>
          </header>

          ${isHome ? renderFeaturedPages(site) : ""}

          <div class="content-layout">
            <article class="article-card markdown-body">
              ${page.html}
              ${renderPagination(page)}
            </article>
            <aside class="content-aside">
              ${renderHeadingLinks(page)}
              ${renderRelatedPages(page)}
            </aside>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

function renderNotFoundPage(site, slug) {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>页面不存在 - ${escapeHtml(site?.site?.title || "用户 Wiki")}</title>
      <link rel="stylesheet" href="/static/wiki.css" />
    </head>
    <body>
      <main class="not-found-shell">
        <p class="brand-kicker">404</p>
        <h1>页面不存在</h1>
        <p>没有找到 slug 为 “${escapeHtml(slug)}” 的 wiki 页面。</p>
        <a class="home-link" href="/">返回首页</a>
      </main>
    </body>
  </html>`;
}

function renderErrorPage(error) {
  const lines = (error.validationErrors || [error.message]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Wiki 配置错误</title>
      <link rel="stylesheet" href="/static/wiki.css" />
    </head>
    <body>
      <main class="not-found-shell">
        <p class="brand-kicker">配置错误</p>
        <h1>Wiki 还不能正常展示</h1>
        <ul class="error-list">${lines}</ul>
      </main>
    </body>
  </html>`;
}

export async function createWikiApp() {
  const app = express();
  const wikiPaths = getWikiPaths();

  app.use("/assets", express.static(wikiPaths.assetsDir));
  app.use("/static", express.static(staticDir));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get("/", async (_req, res, next) => {
    try {
      const site = await loadWikiSite();
      res.type("html").send(renderWikiPage(site, site.site.homePage));
    } catch (error) {
      next(error);
    }
  });

  app.get("/pages/:slug", async (req, res, next) => {
    try {
      const site = await loadWikiSite();
      const page = site.pagesBySlug.get(req.params.slug);
      if (!page || page.hidden) {
        res.status(404).type("html").send(renderNotFoundPage(site, req.params.slug));
        return;
      }
      res.type("html").send(renderWikiPage(site, page));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).type("html").send(renderErrorPage(error));
  });

  return app;
}
