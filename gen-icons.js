'use strict';
const { Jimp } = require('jimp');
const path = require('path');
const fs   = require('fs');

// ── Paleta ──────────────────────────────────────────────────────────────────
const BG    = 0x1C143CFF;   // Azul marino oscuro
const GOLD  = 0xF0AB00FF;   // Dorado
const GOLD2 = 0xC88A00FF;   // Dorado oscuro
const RED_B = 0xCC2222FF;   // Rojo Biblia
const RED_L = 0xEE3333FF;   // Rojo claro (brillo)
const SKIN  = 0xE8C29AFF;   // Piel
const SKIN_D= 0xC8906AFF;   // Piel oscura (sombra)
const NAVY  = 0x12103AFF;   // Azul muy oscuro (traje/zapatos)
const SUIT  = 0x1E1C4AFF;   // Color traje (azul oscuro distinguible del fondo)
const WHITE = 0xFFFFFFFF;
const CREAM = 0xFFF0CCFF;

// ── Helpers de píxel ────────────────────────────────────────────────────────
function fillAll(img, col, W, H) {
  const r=(col>>>24)&0xFF, g=(col>>>16)&0xFF, b=(col>>>8)&0xFF, a=col&0xFF;
  for (let i=0; i<img.bitmap.data.length; i+=4) {
    img.bitmap.data[i]=r; img.bitmap.data[i+1]=g;
    img.bitmap.data[i+2]=b; img.bitmap.data[i+3]=a;
  }
}

function px(img, x, y, col, W, H) {
  if (x<0||y<0||x>=W||y>=H) return;
  const i=(y*W+x)*4;
  img.bitmap.data[i]=(col>>>24)&0xFF; img.bitmap.data[i+1]=(col>>>16)&0xFF;
  img.bitmap.data[i+2]=(col>>>8)&0xFF; img.bitmap.data[i+3]=col&0xFF;
}

function blend(img, x, y, r, g, b, a, W, H) {
  if (x<0||y<0||x>=W||y>=H) return;
  const i=(y*W+x)*4; const f=a/255;
  img.bitmap.data[i]  =Math.round(img.bitmap.data[i]  +(r-img.bitmap.data[i]  )*f);
  img.bitmap.data[i+1]=Math.round(img.bitmap.data[i+1]+(g-img.bitmap.data[i+1])*f);
  img.bitmap.data[i+2]=Math.round(img.bitmap.data[i+2]+(b-img.bitmap.data[i+2])*f);
  img.bitmap.data[i+3]=255;
}

function rect(img, x, y, w, h, col, W, H) {
  for (let dy=0;dy<h;dy++) for (let dx=0;dx<w;dx++) px(img,x+dx,y+dy,col,W,H);
}

function circle(img, cx, cy, r, col, W, H) {
  const r2=r*r;
  for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++)
    if (dx*dx+dy*dy<=r2) px(img,cx+dx,cy+dy,col,W,H);
}

function ellipse(img, cx, cy, rx, ry, col, W, H) {
  for (let dy=-ry;dy<=ry;dy++) for (let dx=-rx;dx<=rx;dx++)
    if ((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1) px(img,cx+dx,cy+dy,col,W,H);
}

function tri(img, ax,ay, bx,by, cx2,cy2, col, W, H) {
  const mnX=Math.max(0,Math.min(ax,bx,cx2)), mxX=Math.min(W-1,Math.max(ax,bx,cx2));
  const mnY=Math.max(0,Math.min(ay,by,cy2)), mxY=Math.min(H-1,Math.max(ay,by,cy2));
  for (let y=mnY;y<=mxY;y++) for (let x=mnX;x<=mxX;x++) {
    const d1=(x-bx)*(ay-by)-(ax-bx)*(y-by);
    const d2=(x-cx2)*(by-cy2)-(bx-cx2)*(y-cy2);
    const d3=(x-ax)*(cy2-ay)-(cx2-ax)*(y-ay);
    const n=(d1<0)||(d2<0)||(d3<0), p=(d1>0)||(d2>0)||(d3>0);
    if (!(n&&p)) px(img,x,y,col,W,H);
  }
}

function trap(img, lx1,rx1,lx2,rx2, y1,y2, col, W, H) {
  for (let y=y1;y<=y2;y++) {
    const t=(y-y1)/(y2-y1||1);
    const lx=Math.round(lx1+(lx2-lx1)*t), rxr=Math.round(rx1+(rx2-rx1)*t);
    for (let x=lx;x<=rxr;x++) px(img,x,y,col,W,H);
  }
}

// ── Fuente bitmap 5×7 para "PREDICADOR" ─────────────────────────────────────
const FONT5 = {
  P:['11110','10010','10010','11110','10000','10000','10000'],
  R:['11110','10010','10010','11110','10100','10010','10001'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  D:['11110','10010','10001','10001','10001','10010','11110'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  A:['00100','01010','10001','10001','11111','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
};

function drawText(img, text, lx0, ly, cw, ch, col, W, H) {
  const gap = Math.round(cw * 0.35);
  let lx = lx0;
  for (const ch2 of text) {
    const bm = FONT5[ch2];
    if (bm) {
      const pw = cw/5, ph = ch/7;
      for (let row=0; row<bm.length; row++)
        for (let col2=0; col2<bm[row].length; col2++)
          if (bm[row][col2]==='1')
            rect(img, Math.round(lx+col2*pw), Math.round(ly+row*ph),
              Math.ceil(pw), Math.ceil(ph), col, W, H);
    }
    lx += cw + gap;
  }
}

// ── Dibujo principal ─────────────────────────────────────────────────────────
async function drawIcon(SIZE) {
  const W=SIZE, H=SIZE;
  const img = new Jimp({ width:W, height:H });
  fillAll(img, BG, W, H);

  const s = v => Math.round(v * SIZE / 512);  // escala respecto a diseño 512px

  // ---- Rayos de luz (16 rayos desde arriba-centro) ----
  const ROX=W*0.5, ROY=H*0.11;
  for (let ri=0; ri<16; ri++) {
    const angle = (ri/16) * Math.PI * 2;
    for (let d=s(15); d<H*0.75; d++) {
      const spread = d * 0.042;
      const fade   = Math.max(0, 1 - d/(H*0.75));
      const alpha  = Math.round(fade * fade * 42);
      if (alpha < 1) continue;
      for (let w=-spread; w<=spread; w+=0.5) {
        const bx=Math.round(ROX + d*Math.cos(angle) + w*Math.sin(angle));
        const by=Math.round(ROY + d*Math.sin(angle) - w*Math.cos(angle));
        blend(img, bx, by, 255, 230, 80, alpha, W, H);
      }
    }
  }

  // ---- Halo dorado difuso detrás de la figura ----
  const HCX=W*0.5, HCY=H*0.44;
  const HRAD=W*0.28;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    const d=Math.sqrt((x-HCX)**2+(y-HCY)**2);
    if (d<HRAD) {
      const a=Math.round(Math.pow(1-d/HRAD, 1.8)*32);
      if (a>0) blend(img,x,y,240,210,80,a,W,H);
    }
  }

  // ---- FIGURA ----
  const MX = Math.round(W*0.5);

  // Piernas
  trap(img, MX-s(28),MX-s(4), MX-s(35),MX-s(11), s(348),s(450), SUIT, W, H);
  trap(img, MX+s(4),MX+s(28), MX+s(11),MX+s(35),  s(348),s(450), SUIT, W, H);

  // Zapatos
  ellipse(img, MX-s(23), s(455), s(26), s(12), NAVY, W, H);
  ellipse(img, MX+s(23), s(455), s(26), s(12), NAVY, W, H);

  // Cuerpo principal (chaqueta)
  trap(img, MX-s(72),MX+s(72), MX-s(52),MX+s(52), s(218),s(355), SUIT, W, H);

  // Camisa (V blanca en el centro)
  tri(img, MX-s(22),s(224), MX+s(22),s(224), MX,s(308), WHITE, W, H);

  // Solapas de la chaqueta (encima de la camisa)
  tri(img, MX-s(72),s(218), MX-s(4),s(224), MX-s(28),s(308), SUIT, W, H);
  tri(img, MX+s(4),s(224), MX+s(72),s(218), MX+s(28),s(308), SUIT, W, H);

  // Corbata dorada
  tri(img, MX-s(10),s(226), MX+s(10),s(226), MX,s(268), GOLD, W, H);
  rect(img, MX-s(7),s(268), s(14), s(44), GOLD, W, H);
  tri(img, MX-s(7),s(312), MX+s(7),s(312), MX,s(328), GOLD, W, H);
  // Nudo de la corbata (detalle)
  rect(img, MX-s(10),s(222), s(20), s(12), GOLD2, W, H);

  // Brazo izquierdo (en reposo, cae)
  trap(img, MX-s(72),MX-s(53), MX-s(82),MX-s(62), s(224),s(345), SUIT, W, H);
  // Mano izquierda
  circle(img, MX-s(72), s(352), s(15), SKIN, W, H);

  // Brazo derecho (extendido, sostiene Biblia)
  trap(img, MX+s(53),MX+s(72), MX+s(72),MX+s(95), s(224),s(325), SUIT, W, H);
  // Antebrazo adelante
  trap(img, MX+s(72),MX+s(95), MX+s(80),MX+s(108), s(325),s(385), SUIT, W, H);

  // Cuello (camisa)
  rect(img, MX-s(14),s(194), s(28),s(30), WHITE, W, H);

  // ---- BIBLIA (mano derecha) ----
  const BX=MX+s(72), BY=s(345), BW=s(64), BH=s(84);
  // Sombra
  rect(img, BX+s(4),BY+s(4), BW,BH, 0x55000088, W, H);
  // Tapa
  rect(img, BX,BY, BW,BH, RED_B, W, H);
  // Brillo en esquina
  rect(img, BX+s(4),BY+s(4), s(12),s(8), RED_L, W, H);
  // Páginas (canto derecho)
  rect(img, BX+BW,BY+s(5), s(9),BH-s(10), CREAM, W, H);
  for (let lpy=BY+s(7); lpy<BY+BH-s(5); lpy+=s(5))
    rect(img, BX+BW+s(1),lpy, s(7),s(2), 0xCCBB99FF, W, H);
  // Cruz dorada en la tapa
  rect(img, BX+s(20),BY+s(24), s(24),s(7), GOLD, W, H);
  rect(img, BX+s(28),BY+s(14), s(8), s(28), GOLD, W, H);

  // ---- CABEZA ----
  circle(img, MX, s(158), s(43), SKIN, W, H);

  // Pelo (parte superior + lados)
  for (let dy=-s(43); dy<=s(5); dy++)
    for (let dx=-s(43); dx<=s(43); dx++)
      if (dx*dx+dy*dy<=s(43)*s(43) && dy<s(6))
        px(img, MX+dx, s(158)+dy, NAVY, W, H);

  // Cara (re-dibuja encima del pelo)
  for (let dy=-s(35); dy<=s(35); dy++)
    for (let dx=-s(30); dx<=s(30); dx++)
      if ((dx*dx)/(s(30)*s(30))+(dy*dy)/(s(35)*s(35))<=1 && dy>-s(8))
        px(img, MX+dx, s(158)+dy, SKIN, W, H);

  // Ojos
  circle(img, MX-s(12),s(152), s(5), NAVY, W, H);
  circle(img, MX+s(12),s(152), s(5), NAVY, W, H);
  // Brillo en los ojos
  px(img, MX-s(11),s(150), WHITE, W, H);
  px(img, MX+s(13),s(150), WHITE, W, H);

  // Cejas
  rect(img, MX-s(18),s(143), s(14),s(4), NAVY, W, H);
  rect(img, MX+s(4), s(143), s(14),s(4), NAVY, W, H);

  // Nariz
  circle(img, MX, s(163), s(4), SKIN_D, W, H);

  // Boca (sonrisa)
  for (let dx=-s(10); dx<=s(10); dx++) {
    const dy = Math.round(s(4)*Math.sin((dx/s(10))*Math.PI)*0.5);
    px(img, MX+dx, s(174)+dy, SKIN_D, W, H);
    px(img, MX+dx, s(175)+dy, SKIN_D, W, H);
  }

  // ---- TEXTO "PREDICADOR" ----
  const TEXT = 'PREDICADOR';
  const CW = s(32), CH = s(44), CGAP = s(8);
  const totalW = TEXT.length*(CW+CGAP)-CGAP;
  const TLX = Math.round((W-totalW)/2);
  const TLY = H - s(82);

  // Sombra del texto
  drawText(img, TEXT, TLX+s(2), TLY+s(2), CW, CH, 0x00000099, W, H);
  // Texto dorado
  drawText(img, TEXT, TLX, TLY, CW, CH, GOLD, W, H);
  // Línea decorativa dorada
  rect(img, Math.round(W*0.18), TLY+CH+s(6), Math.round(W*0.64), s(4), GOLD2, W, H);
  rect(img, Math.round(W*0.22), TLY+CH+s(11), Math.round(W*0.56), s(2), GOLD, W, H);

  return img;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const ICONS_DIR = path.join(__dirname, 'icons');
  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, {recursive:true});

  console.log('Generando ícono 512×512…');
  const img512 = await drawIcon(512);
  await img512.write(path.join(ICONS_DIR, 'icon-512x512.png'));
  console.log('✓ icons/icon-512x512.png');

  console.log('Escalando a 192×192…');
  const img192 = img512.clone();
  img192.resize({ w:192, h:192 });
  await img192.write(path.join(ICONS_DIR, 'icon-192x192.png'));
  console.log('✓ icons/icon-192x192.png');

  console.log('Escalando a favicon 48×48…');
  const img48 = img512.clone();
  img48.resize({ w:48, h:48 });
  // Jimp no soporta .ico; guardar como PNG y renombrar
  const faviconPng = path.join(__dirname, 'favicon_tmp.png');
  await img48.write(faviconPng);
  fs.renameSync(faviconPng, path.join(__dirname, 'favicon.ico'));
  console.log('✓ favicon.ico');

  // Limpiar test files si existen
  ['test.png','test512.png','test32.png'].forEach(f=>{
    const fp=path.join(__dirname,f);
    if(fs.existsSync(fp)) fs.unlinkSync(fp);
  });

  console.log('\n✅ Íconos generados correctamente.');
})().catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); });
