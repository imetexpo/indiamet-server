const path = require('path');
const QRCode = require('qrcode');

const WIDTH = 900;
const HEIGHT = 1428;
const LOGO_FILE = path.join(__dirname, '../assets/badge/indiamet-logo.png');
let canvasModule;
let logoPromise;

function getCanvas() {
  if (!canvasModule) canvasModule = require('@napi-rs/canvas');
  return canvasModule;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function wrapLines(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of Array.from(word)) {
      if (line && ctx.measureText(line + character).width > width) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(ctx, text, options = {}) {
  const value = cleanText(text).toUpperCase();
  if (!value) return;
  const top = options.top ?? 0;
  const height = options.height ?? 40;
  const width = options.width ?? 816;
  const maxLines = options.maxLines ?? 2;
  const minSize = options.minSize ?? 20;
  const lineSpacing = options.lineSpacing ?? 1.2;
  let fontSize = options.size ?? 30;
  let lines = [];
  for (; fontSize >= minSize; fontSize -= 1) {
    ctx.font = (options.weight ?? 500) + ' ' + fontSize + 'px Arial';
    lines = wrapLines(ctx, value, width);
    if (lines.length <= maxLines && lines.length * fontSize * lineSpacing <= height) break;
  }
  fontSize = Math.max(fontSize, minSize);
  ctx.font = (options.weight ?? 500) + ' ' + fontSize + 'px Arial';
  lines = wrapLines(ctx, value, width);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('');
    lines[maxLines - 1] = last + '…';
  }
  const lineHeight = fontSize * lineSpacing;
  const firstY = top + height / 2 - (lines.length - 1) * lineHeight / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect((WIDTH - width) / 2, top, width, height);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.color ?? '#000000';
  lines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, firstY + index * lineHeight));
  ctx.restore();
}

function trackedText(ctx, text, centerX, y, size, tracking, color, weight = 700) {
  ctx.font = weight + ' ' + size + 'px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const letters = Array.from(text);
  const widths = letters.map((letter) => ctx.measureText(letter).width);
  let x = centerX - (widths.reduce((sum, item) => sum + item, 0) + tracking * (letters.length - 1)) / 2;
  letters.forEach((letter, index) => {
    ctx.fillText(letter, x, y);
    x += widths[index] + tracking;
  });
}

function loadLogo() {
  const { loadImage } = getCanvas();
  if (!logoPromise) {
    logoPromise = loadImage(LOGO_FILE).catch((error) => {
      logoPromise = null;
      throw error;
    });
  }
  return logoPromise;
}

async function renderVisitorBadgePng({ visitor = {}, isSample = false } = {}) {
  const { createCanvas, loadImage } = getCanvas();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const logo = await loadLogo();
  const logoWidth = 440;
  const logoHeight = logoWidth * logo.height / logo.width;
  ctx.drawImage(logo, (WIDTH - logoWidth) / 2, 76, logoWidth, logoHeight);
  ctx.fillStyle = '#00A651';
  ctx.fillRect(32, 358, WIDTH - 64, 6);

  textBlock(ctx, visitor.name || 'Visitor', {
    top: 428, height: 100, width: 816, size: 58, minSize: 32, maxLines: 2, weight: 800,
  });
  let detailsTop = 546;
  if (cleanText(visitor.designation)) {
    textBlock(ctx, visitor.designation, {
      top: detailsTop, height: 44, width: 816, size: 34, minSize: 23, maxLines: 1, weight: 450,
    });
    detailsTop += 56;
  }
  textBlock(ctx, visitor.company, {
    top: detailsTop, height: 62, width: 820, size: 35, minSize: 23, maxLines: 2, weight: 450,
  });
  if (cleanText(visitor.country)) {
    textBlock(ctx, visitor.country, {
      top: detailsTop + 72, height: 40, width: 816, size: 32, minSize: 23, maxLines: 1, weight: 450,
    });
  }

  const frontend = (process.env.FRONTEND_URL || 'https://indiametexpo.com').replace(/\/+$/, '');
  const qrPayload = visitor.qrPayload || (visitor.publicCode
    ? frontend + '/passes/view/' + encodeURIComponent(visitor.publicCode)
    : frontend + '/passes/view/SAMPLE-IM2027-001');
  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    errorCorrectionLevel: 'M', margin: 4, width: 414,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  const qrImage = await loadImage(qrBuffer);
  ctx.drawImage(qrImage, 243, 728, 414, 414);

  const visitorId = 'IM-' + cleanText(visitor.registrationNumber).replace(/\D/g, '').slice(-6);
  textBlock(ctx, 'Visitor ID: ' + (visitorId === 'IM-' ? 'IM-120042' : visitorId), {
    top: 1148, height: 44, width: 820, size: 26, minSize: 17, maxLines: 1, weight: 450,
  });
  ctx.fillStyle = '#00A651';
  ctx.fillRect(32, 1236, WIDTH - 64, 128);
  trackedText(ctx, 'VISITOR', WIDTH / 2, 1300, 42, 3, '#000000', 700);
  if (isSample) {
    textBlock(ctx, 'SAMPLE PREVIEW - NOT VALID FOR ENTRY', {
      top: 1374, height: 26, width: 820, size: 14, minSize: 12, maxLines: 1, weight: 400, color: '#94A3B8',
    });
  }
  return canvas.encode('png');
}

async function renderSamplePng() {
  return renderVisitorBadgePng({
    isSample: true,
    visitor: {
      name: 'Aarav Sharma',
      designation: 'Head of Quality & Metrology',
      company: 'Apex Precision Engineering Pvt. Ltd.',
      city: 'Pune', state: 'Maharashtra', country: 'India',
      registrationNumber: 'REG-IM-12052027-00042',
      publicCode: 'SAMPLE-IM2027-001',
    },
  });
}

module.exports = { renderVisitorBadgePng, renderSamplePng };