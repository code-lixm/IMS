#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapCdata(value) {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectAssets(assetsDir) {
  return fs.readdirSync(assetsDir)
    .map((name) => ({
      name,
      filePath: path.join(assetsDir, name),
    }))
    .filter((entry) => fs.statSync(entry.filePath).isFile())
    .filter((entry) => /\.(dmg|zip|tar\.[^.]+|aar)$/i.test(entry.name));
}

function signAsset(signUpdateBinary, keyFile, assetPath) {
  const output = execFileSync(signUpdateBinary, ["-f", keyFile, assetPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  const match = output.match(/sparkle:edSignature="([^"]+)"\s+(?:sparkle:)?length="(\d+)"/);
  if (!match) {
    throw new Error(`Unable to parse sign_update output for ${assetPath}: ${output}`);
  }

  return {
    edSignature: match[1],
    length: Number(match[2]),
  };
}

function buildReleaseUrl(repo, tagName) {
  return `https://github.com/${repo}/releases/tag/${tagName}`;
}

function buildItems({ repo, release, assets, downloadUrlPrefix, signUpdateBinary, keyFile, minimumSystemVersion }) {
  const publishedAt = new Date(release.publishedAt).toUTCString();
  const shortVersion = String(release.tagName || "").replace(/^v/, "");
  const releaseUrl = buildReleaseUrl(repo, release.tagName);
  const releaseBody = String(release.body || "").trim();

  return assets.map((asset) => {
    const signature = signAsset(signUpdateBinary, keyFile, asset.filePath);
    const titleBase = String(release.name || release.tagName || shortVersion || asset.name).trim();
    const title = titleBase.includes(asset.name) ? titleBase : `${titleBase} · ${asset.name}`;
    const lines = [
      "    <item>",
      `      <title>${escapeXml(title)}</title>`,
      `      <link>${escapeXml(releaseUrl)}</link>`,
      `      <sparkle:version>${escapeXml(shortVersion)}</sparkle:version>`,
      `      <sparkle:shortVersionString>${escapeXml(shortVersion)}</sparkle:shortVersionString>`,
      `      <sparkle:fullReleaseNotesLink>${escapeXml(releaseUrl)}</sparkle:fullReleaseNotesLink>`,
      `      <pubDate>${escapeXml(publishedAt)}</pubDate>`,
    ];

    if (minimumSystemVersion) {
      lines.push(`      <sparkle:minimumSystemVersion>${escapeXml(minimumSystemVersion)}</sparkle:minimumSystemVersion>`);
    }

    if (releaseBody) {
      lines.push(`      <description sparkle:format="plain-text">${wrapCdata(releaseBody)}</description>`);
    }

    lines.push(
      `      <enclosure url="${escapeXml(`${downloadUrlPrefix}${asset.name}`)}" sparkle:edSignature="${escapeXml(signature.edSignature)}" length="${signature.length}" type="application/octet-stream" />`,
      "    </item>",
    );

    return lines.join("\n");
  });
}

function main() {
  const args = parseArgs(process.argv);
  const required = [
    "repo",
    "release-json",
    "assets-dir",
    "output-dir",
    "download-url-prefix",
    "sign-update",
    "ed-key-file",
  ];

  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.join(", ")}`);
  }

  const release = readJson(args["release-json"]);
  const assets = collectAssets(args["assets-dir"]);
  if (assets.length === 0) {
    throw new Error(`No Sparkle archive assets found in ${args["assets-dir"]}`);
  }

  fs.mkdirSync(args["output-dir"], { recursive: true });

  const items = buildItems({
    repo: args.repo,
    release,
    assets,
    downloadUrlPrefix: args["download-url-prefix"],
    signUpdateBinary: args["sign-update"],
    keyFile: args["ed-key-file"],
    minimumSystemVersion: args["minimum-system-version"] || "",
  });

  const channelTitle = release.name || release.tagName || "IMS";
  const feed = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">',
    "  <channel>",
    `    <title>${escapeXml(channelTitle)}</title>`,
    "    <language>en</language>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args["output-dir"], "appcast.xml"), feed, "utf8");
}

main();
