import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { renderMarkdown } from "./markdown.js";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getWikiPaths() {
  const wikiDir = path.join(config.rootDir, "wiki");
  return {
    wikiDir,
    navigationPath: path.join(wikiDir, "navigation.json"),
    contentDir: path.join(wikiDir, "content"),
    assetsDir: path.join(wikiDir, "assets")
  };
}

function buildPageLookup(groups = [], errors = [], contentDir) {
  const pagesBySlug = new Map();
  const normalizedGroups = [];

  for (const rawGroup of groups) {
    const groupTitle = String(rawGroup?.title || "").trim();
    const rawPages = ensureArray(rawGroup?.pages);
    const pages = [];

    if (!groupTitle) {
      errors.push("导航分组缺少 title。");
      continue;
    }

    for (const rawPage of rawPages) {
      const slug = String(rawPage?.slug || "").trim();
      const title = String(rawPage?.title || "").trim();
      if (!slug) {
        errors.push(`分组“${groupTitle}”存在缺少 slug 的页面配置。`);
        continue;
      }
      if (!title) {
        errors.push(`页面“${slug}”缺少 title。`);
      }
      if (pagesBySlug.has(slug)) {
        errors.push(`页面 slug 重复：${slug}`);
        continue;
      }

      const page = {
        slug,
        title,
        summary: String(rawPage?.summary || "").trim(),
        audience: String(rawPage?.audience || "").trim(),
        status: String(rawPage?.status || "").trim(),
        lastReviewed: String(rawPage?.lastReviewed || "").trim(),
        hidden: Boolean(rawPage?.hidden),
        relatedPageSlugs: ensureArray(rawPage?.relatedPages).map((item) => String(item || "").trim()).filter(Boolean),
        groupTitle,
        sourcePath: path.join(contentDir, `${slug}.md`),
        markdown: "",
        html: "",
        headings: [],
        relatedPages: [],
        prevPage: null,
        nextPage: null
      };

      if (!page.summary) {
        errors.push(`页面“${slug}”缺少 summary。`);
      }

      pagesBySlug.set(slug, page);
      pages.push(page);
    }

    normalizedGroups.push({
      title: groupTitle,
      pages
    });
  }

  return {
    pagesBySlug,
    groups: normalizedGroups
  };
}

async function hydratePages(pagesBySlug, errors) {
  for (const page of pagesBySlug.values()) {
    if (!(await exists(page.sourcePath))) {
      errors.push(`页面“${page.slug}”缺少内容文件：${page.sourcePath}`);
      continue;
    }

    page.markdown = await fs.readFile(page.sourcePath, "utf8");
    const rendered = renderMarkdown(page.markdown);
    page.html = rendered.html;
    page.headings = rendered.headings;
    page.links = rendered.links;
  }
}

async function validateMarkdownLinks(page, pagesBySlug, assetsDir, errors) {
  for (const link of page.links || []) {
    const href = String(link.href || "").trim();
    if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) {
      continue;
    }

    if (href.startsWith("/pages/")) {
      const slug = href.slice("/pages/".length).split("#")[0];
      const target = pagesBySlug.get(slug);
      if (!target || target.hidden) {
        errors.push(`页面“${page.slug}”包含失效的页面链接：${href}`);
      }
      continue;
    }

    if (href.startsWith("/assets/")) {
      const relativePath = href.slice("/assets/".length);
      const assetPath = path.join(assetsDir, relativePath);
      if (!(await exists(assetPath))) {
        errors.push(`页面“${page.slug}”引用了不存在的资源：${href}`);
      }
      continue;
    }
  }
}

function createSiteError(errors) {
  const message = `Invalid wiki site:\n- ${errors.join("\n- ")}`;
  const error = new Error(message);
  error.validationErrors = errors;
  return error;
}

async function buildWikiSite() {
  const paths = getWikiPaths();
  const errors = [];

  if (!(await exists(paths.navigationPath))) {
    errors.push(`缺少 wiki 导航配置：${paths.navigationPath}`);
    return { ok: false, errors, paths };
  }

  const navigation = JSON.parse(await fs.readFile(paths.navigationPath, "utf8"));
  const siteMeta = {
    title: String(navigation?.site?.title || "用户 Wiki").trim(),
    summary: String(navigation?.site?.summary || "").trim(),
    homePageSlug: String(navigation?.site?.homePageSlug || "").trim(),
    featuredPageSlugs: ensureArray(navigation?.site?.featuredPageSlugs).map((item) => String(item || "").trim()).filter(Boolean)
  };

  const lookup = buildPageLookup(ensureArray(navigation?.groups), errors, paths.contentDir);
  await hydratePages(lookup.pagesBySlug, errors);

  const orderedPages = [];
  for (const group of lookup.groups) {
    group.pages = group.pages.filter((page) => !page.hidden);
    orderedPages.push(...group.pages);
  }

  for (const [index, page] of orderedPages.entries()) {
    page.prevPage = orderedPages[index - 1] || null;
    page.nextPage = orderedPages[index + 1] || null;
  }

  for (const page of lookup.pagesBySlug.values()) {
    page.relatedPages = page.relatedPageSlugs
      .map((slug) => {
        const related = lookup.pagesBySlug.get(slug);
        if (!related || related.hidden) {
          errors.push(`页面“${page.slug}”引用了不存在的 relatedPages 项：${slug}`);
          return null;
        }
        return related;
      })
      .filter(Boolean);

    await validateMarkdownLinks(page, lookup.pagesBySlug, paths.assetsDir, errors);
  }

  const homePage = lookup.pagesBySlug.get(siteMeta.homePageSlug);
  if (!homePage || homePage.hidden) {
    errors.push(`homePageSlug 未命中可见页面：${siteMeta.homePageSlug}`);
  }

  const featuredPages = siteMeta.featuredPageSlugs
    .map((slug) => {
      const page = lookup.pagesBySlug.get(slug);
      if (!page || page.hidden) {
        errors.push(`featuredPageSlugs 包含不存在的页面：${slug}`);
        return null;
      }
      return page;
    })
    .filter(Boolean);

  return {
    ok: errors.length === 0,
    errors,
    paths,
    site: {
      ...siteMeta,
      homePage,
      featuredPages
    },
    groups: lookup.groups.filter((group) => group.pages.length > 0),
    orderedPages,
    pagesBySlug: lookup.pagesBySlug
  };
}

export async function validateWikiSite() {
  const site = await buildWikiSite();
  return {
    ok: site.ok,
    errors: site.errors
  };
}

export async function loadWikiSite() {
  const site = await buildWikiSite();
  if (!site.ok) {
    throw createSiteError(site.errors);
  }
  return site;
}

export function isWikiLink(link = "") {
  return new RegExp(`^/pages/${escapeRegExp(String(link || ""))}(?:#.*)?$`).test(link);
}
