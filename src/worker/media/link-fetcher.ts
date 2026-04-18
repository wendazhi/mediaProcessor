import axios from "axios";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const SOCIAL_DOMAINS = new Set([
  "douyin.com", "iesdouyin.com", "v.douyin.com",
  "xiaohongshu.com", "xhs.link",
  "weibo.com", "weibo.cn",
  "bilibili.com", "b23.tv",
  "youtube.com", "youtu.be",
]);

function isSocialMedia(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return Array.from(SOCIAL_DOMAINS).some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

function isPrivateIP(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    );
  } catch {
    return true;
  }
}

export async function fetchLinkContent(url: string): Promise<{ text: string; truncated: boolean }> {
  if (isPrivateIP(url)) {
    throw new Error("Private IP addresses are not allowed");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Only HTTP/HTTPS URLs are supported");
  }

  const usePlaywright = isSocialMedia(url);

  if (usePlaywright) {
    return fetchWithPlaywright(url);
  }

  return fetchWithAxios(url);
}

async function fetchWithAxios(url: string): Promise<{ text: string; truncated: boolean }> {
  const response = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  const contentType = response.headers["content-type"] || "";

  if (contentType.includes("text/html")) {
    return extractFromHtml(response.data);
  }

  return { text: String(response.data), truncated: false };
}

async function fetchWithPlaywright(url: string): Promise<{ text: string; truncated: boolean }> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => {
      document.querySelectorAll("script, style, nav, header, footer, aside").forEach((el) => el.remove());
      return document.body?.innerText || "";
    });

    return { text: text.trim(), truncated: false };
  } finally {
    await browser.close();
  }
}

function extractFromHtml(html: string): { text: string; truncated: boolean } {
  const $ = cheerio.load(html);

  $("script, style, nav, header, footer, aside, [class*='ad'], [class*='sidebar']").remove();

  let text = $("article").text() || $("main").text() || $("[role='main']").text();

  if (!text.trim()) {
    text = $("body").text();
  }

  text = text.replace(/\s+/g, " ").trim();

  const MAX_LENGTH = 50000;
  const truncated = text.length > MAX_LENGTH;

  return {
    text: text.slice(0, MAX_LENGTH),
    truncated,
  };
}
