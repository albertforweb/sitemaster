import fs from 'node:fs';
import path from 'node:path';
import { DEPLOYMENTS_DIR } from './config.js';
import { getSite, listPages } from './db.js';
import { renderSite } from './render.js';

const MANIFEST_NAME = '.sitemaster-manifest.json';

function outputDirectory(slug) {
  // Mainsite is mounted at Nginx's root. Other local sites are mounted below
  // /sites/<slug>/ by the same Nginx document root.
  return slug === 'mainsite'
    ? DEPLOYMENTS_DIR
    : path.join(DEPLOYMENTS_DIR, 'sites', slug);
}

function readManifest(outputDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(outputDir, MANIFEST_NAME), 'utf8'));
    return Array.isArray(value?.files) ? value.files.filter((file) => /^[a-z0-9-]+\.html$/.test(file) || file === 'index.html') : [];
  } catch {
    return [];
  }
}

export function publishSite(slug) {
  const site = getSite(slug);
  if (!site) return null;
  const pages = listPages(slug, { publishedOnly: true });
  if (!pages.length) throw new Error('Publish requires at least one published page');
  const outputDir = outputDirectory(slug);
  // Published files are public website artifacts. They must be readable by
  // the Nginx worker, which runs as a different user from Sitemaster.
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  if (slug !== 'mainsite') fs.chmodSync(path.dirname(outputDir), 0o755);
  fs.chmodSync(outputDir, 0o755);
  const previousFiles = readManifest(outputDir);
  const files = [];
  for (const page of pages) {
    const filename = page.slug === 'home' ? 'index.html' : `${page.slug}.html`;
    fs.writeFileSync(path.join(outputDir, filename), renderSite(site, page), { encoding: 'utf8', mode: 0o644 });
    files.push(filename);
  }
  for (const filename of previousFiles.filter((filename) => !files.includes(filename))) {
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }
  fs.writeFileSync(path.join(outputDir, MANIFEST_NAME), JSON.stringify({ files, publishedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o644 });
  return { site, files, outputDir };
}

export function unpublishSite(slug) {
  const outputDir = outputDirectory(slug);
  const files = readManifest(outputDir);
  for (const filename of files) fs.rmSync(path.join(outputDir, filename), { force: true });
  fs.rmSync(path.join(outputDir, MANIFEST_NAME), { force: true });
  return { files, outputDir };
}
