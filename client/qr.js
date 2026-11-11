// A QR drawn in this browser, as SVG text: for links that carry a key or a time code (the door link, the ticket's door
// QR), so nothing secret goes to the server. `icons`: one peanut, one mic and one beer in a small box in the middle,
// with the highest error correction (H, up to 30% of the code can be covered; the box covers about 5%).
import QRCode from 'qrcode';

const COLOR = { dark: '#050914', light: '#efe3c8' };
// Icons: peanut-outline, microphone and beer, from Material Design Icons (Apache 2.0), on a 24-unit square.
const ICONS = [
  'M12 23c-.47 0-.93-.05-1.39-.15c-3.51-.75-5.74-4.21-4.99-7.72c.25-1.18.83-2.26 1.66-3.13a.93.93 0 0 0 0-1.28c-2.08-2.58-1.68-6.36.9-8.44s6.36-1.673 8.44.91c1.77 2.19 1.77 5.31 0 7.53c-.29.41-.25.98.1 1.34c2.45 2.62 2.32 6.74-.31 9.19A6.44 6.44 0 0 1 12 23m0-20c-.91 0-1.8.31-2.5.89a3.98 3.98 0 0 0-.62 5.61c.96 1.14.89 2.83-.15 3.91c-1.7 1.81-1.6 4.66.21 6.36s4.66 1.61 6.36-.21a4.5 4.5 0 0 0 0-6.15a3 3 0 0 1-.18-4a4 4 0 0 0-.62-5.62c-.5-.38-1.03-.65-1.62-.79zm0 3c0 .55.45 1 1 1s1-.45 1-1s-.45-1-1-1s-1 .45-1 1m2 13c.55 0 1-.45 1-1s-.45-1-1-1s-1 .45-1 1s.45 1 1 1m-1-3c.55 0 1-.45 1-1s-.45-1-1-1s-1 .45-1 1s.45 1 1 1m-2 2c.55 0 1-.45 1-1s-.45-1-1-1s-1 .45-1 1s.45 1 1 1',
  'M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z',
  'M4,2H19L17,22H6L4,2M6.2,4L7.8,20H8.8L7.43,6.34C8.5,6 9.89,5.89 11,7C12.56,8.56 15.33,7.69 16.5,7.23L16.8,4H6.2Z',
];

function withIcons(svg) {
  const n = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
  if (!n) return svg;
  const s = n * 0.1; // each icon
  const g = s * 0.25;
  const w = 3 * s + 4 * g;
  const h = s + 2 * g;
  const x0 = (n - w) / 2;
  const y0 = (n - h) / 2;
  const icons = ICONS.map((d, i) => `<path fill="${COLOR.dark}" transform="translate(${(x0 + g + i * (s + g)).toFixed(2)} ${(y0 + g).toFixed(2)}) scale(${(s / 24).toFixed(4)})" d="${d}"/>`).join('');
  return svg.replace('</svg>', `<rect x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(g * 0.8).toFixed(2)}" fill="${COLOR.light}"/>${icons}</svg>`);
}

export async function qrSvg(text, { icons = false } = {}) {
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: COLOR, errorCorrectionLevel: icons ? 'H' : 'M' });
  return icons ? withIcons(svg) : svg;
}
