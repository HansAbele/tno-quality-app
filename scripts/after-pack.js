// After-pack hook: stamp the company logo into the Windows .exe.
//
// We disable electron-builder's built-in .exe editing (signAndEditExecutable=false)
// because it requires winCodeSign, which fails to extract on non-admin Windows
// (the .7z contains darwin symlinks). Instead we run rcedit ourselves, which is
// the same library electron-builder uses internally for icon embedding, but we
// only need it for the icon — no signing tools, no symlinks.

const path = require("path");

// rcedit v5 ships as an ES module, so we load it via dynamic import().
// We can't use a top-level static require — that returns the module record
// object, not the default export, and calling it throws "rcedit is not a
// function". Dynamic import inside the hook gives us the real function.

module.exports = async function (context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");

  const productName = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const iconPath = path.resolve(__dirname, "..", "logo.ico");

  console.log(`[after-pack] embedding icon ${iconPath} into ${exePath}`);

  await rcedit(exePath, {
    icon: iconPath,
  });

  console.log("[after-pack] icon embedded successfully");
};
