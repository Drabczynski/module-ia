/* Rend promo.html image par image et l'encode en MP4.
   node render.cjs <url de promo.html> <sortie.mp4> <ffmpeg> [ips] */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
(async () => {
  const [url, out, ffmpeg, fpsArg] = process.argv.slice(2);
  const fps = +fpsArg || 30;
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(url + "?render"); await p.waitForFunction(() => window.READY);
  const dur = await p.evaluate(() => window.DURATION);
  const ff = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate(t => window.render(t), i / fps);
    const img = await p.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 120 === 0) console.log(`${i}/${n}`);
  }
  ff.stdin.end(); await new Promise(r => ff.on("close", r)); await b.close();
})();
