const fs = require("node:fs/promises");
const path = require("node:path");
const {
  generateFaviconAsync,
  generateImageAsync,
} = require("@expo/image-utils");
const { withDangerousMod } = require("expo/config-plugins");

async function iconImage(projectRoot, width, height) {
  const image = await generateImageAsync(
    { projectRoot, cacheType: "rayna-desktop-icons" },
    {
      src: path.join(projectRoot, "assets", "icon.png"),
      width,
      height,
      resizeMode: "contain",
      backgroundColor: "transparent",
    },
  );
  return image.source;
}

function insertOnce(contents, marker, anchor, insertion) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(anchor))
    throw new Error(`Rayna BASS prebuild could not find ${anchor}`);
  return contents.replace(anchor, `${anchor}${insertion}`);
}

module.exports = function withRaynaBass(config) {
  config = withDangerousMod(config, [
    "macos",
    async (mod) => {
      // Expo Desktop's macOS template contains an empty AppIcon catalog.
      const iconDirectory = path.join(
        mod.modRequest.platformProjectRoot,
        `${mod.name}-macOS`,
        "Assets.xcassets",
        "AppIcon.appiconset",
      );
      const iconContentsPath = path.join(iconDirectory, "Contents.json");
      const iconContents = JSON.parse(
        await fs.readFile(iconContentsPath, "utf8"),
      );
      const images = new Map();
      for (const image of iconContents.images) {
        const pixels =
          Number(image.size.split("x")[0]) * Number(image.scale[0]);
        image.filename = `rayna-${image.size}-${image.scale}.png`;
        images.set(image.filename, pixels);
      }
      for (const [filename, pixels] of images)
        await fs.writeFile(
          path.join(iconDirectory, filename),
          await iconImage(mod.modRequest.projectRoot, pixels, pixels),
        );
      await fs.writeFile(
        iconContentsPath,
        JSON.stringify(iconContents, null, 2) + "\n",
      );
      const sourceDirectory = path.resolve(
        mod.modRequest.projectRoot,
        "..",
        "vendor",
        "bass",
        "macos",
      );
      const resourceDirectory = path.join(
        mod.modRequest.projectRoot,
        "native",
        "audio",
        "generated-bass",
      );
      await fs.mkdir(resourceDirectory, { recursive: true });
      for (const name of [
        "libbass.dylib",
        "libbassflac.dylib",
        "libbasshls.dylib",
        "libbassopus.dylib",
      ]) {
        await fs.copyFile(
          path.join(sourceDirectory, name),
          path.join(resourceDirectory, name),
        );
      }
      await fs.copyFile(
        path.join(
          mod.modRequest.projectRoot,
          "native",
          "audio",
          "proxy",
          "vendor",
          "LICENSE",
        ),
        path.join(resourceDirectory, "cpp-httplib-LICENSE.txt"),
      );
      const podfile = path.join(mod.modRequest.platformProjectRoot, "Podfile");
      const contents = await fs.readFile(podfile, "utf8");
      const anchor = `target '${mod.name}-macOS' do`;
      await fs.writeFile(
        podfile,
        insertOnce(
          contents,
          "# Rayna BASS",
          anchor,
          "\n  # Rayna BASS\n  pod 'RaynaBass', :path => '../native/audio'\n",
        ),
      );
      // The upstream template uses a differently cased Info.plist path. This
      // breaks prebuild and case-sensitive macOS filesystems.
      const project = path.join(
        mod.modRequest.platformProjectRoot,
        `${mod.name}.xcodeproj`,
        "project.pbxproj",
      );
      const projectContents = await fs.readFile(project, "utf8");
      await fs.writeFile(
        project,
        projectContents.replaceAll(
          `${mod.name}-macos/Info.plist`,
          `${mod.name}-macOS/Info.plist`,
        ),
      );
      return mod;
    },
  ]);
  return withDangerousMod(config, [
    "windows",
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const projectRoot = mod.modRequest.projectRoot;
      const icon = await generateFaviconAsync(
        await fs.readFile(path.join(projectRoot, "assets", "icon.png")),
        [16, 24, 32, 48, 64, 128, 256],
      );
      await Promise.all(
        ["MyApp.ico", "small.ico"].map((name) =>
          fs.writeFile(path.join(root, "MyApp", name), icon),
        ),
      );
      const packageImages = path.join(root, "MyApp.Package", "Images");
      for (const [name, width, height] of [
        ["StoreLogo.png", 50, 50],
        ["LockScreenLogo.scale-200.png", 48, 48],
        ["Square44x44Logo.scale-200.png", 88, 88],
        ["Square44x44Logo.targetsize-24_altform-unplated.png", 24, 24],
        ["Square150x150Logo.scale-200.png", 300, 300],
        ["Wide310x150Logo.scale-200.png", 620, 300],
        ["SplashScreen.scale-200.png", 1240, 600],
      ])
        await fs.writeFile(
          path.join(packageImages, name),
          await iconImage(projectRoot, width, height),
        );
      const host = path.join(root, "MyApp", "MyApp.cpp");
      const project = path.join(root, "MyApp", "MyApp.vcxproj");
      const source = await fs.readFile(host, "utf8");
      let hostSource = insertOnce(
        source,
        "// Rayna BASS module",
        '#include "NativeModules.h"',
        '\n// Rayna BASS module\n#include "../../native/audio/windows/RaynaBassModule.h"',
      );
      hostSource = insertOnce(
        hostSource,
        "// Rayna session module",
        '#include "../../native/audio/windows/RaynaBassModule.h"',
        '\n// Rayna session module\n#include "../../native/audio/windows/RaynaSessionModule.h"',
      );
      hostSource = insertOnce(
        hostSource,
        "// Rayna database module",
        '#include "../../native/audio/windows/RaynaSessionModule.h"',
        '\n// Rayna database module\n#include "../../native/audio/windows/RaynaDatabaseModule.h"',
      );
      hostSource = insertOnce(
        hostSource,
        "// Rayna transfer module",
        '#include "../../native/audio/windows/RaynaDatabaseModule.h"',
        '\n// Rayna transfer module\n#include "../../native/audio/windows/RaynaTransferModule.h"',
      );
      hostSource = insertOnce(
        hostSource,
        "// Rayna proxy module",
        '#include "../../native/audio/windows/RaynaTransferModule.h"',
        '\n// Rayna proxy module\n#include "../../native/audio/windows/RaynaProxyModule.h"',
      );
      await fs.writeFile(host, hostSource);

      let xml = await fs.readFile(project, "utf8");
      const hostCompile = xml.includes('<ClCompile Include="MyApp.cpp" />')
        ? '<ClCompile Include="MyApp.cpp" />'
        : '<ClCompile Include="MyApp.cpp"></ClCompile>';
      xml = xml.replace(
        "<LanguageStandard>stdcpp17</LanguageStandard>",
        "<LanguageStandard>stdcpp20</LanguageStandard>",
      );
      xml = insertOnce(
        xml,
        "<LanguageStandard>stdcpp20</LanguageStandard>",
        "<ClCompile>",
        "\n      <LanguageStandard>stdcpp20</LanguageStandard>",
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\BassEngine.cpp">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\BassEngine.cpp"><PrecompiledHeader>NotUsing</PrecompiledHeader></ClCompile>',
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\session\\SessionFile.cpp">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\session\\SessionFile.cpp"><PrecompiledHeader>NotUsing</PrecompiledHeader></ClCompile>',
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\sqlite\\Database.cpp">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\sqlite\\Database.cpp"><PrecompiledHeader>NotUsing</PrecompiledHeader></ClCompile>',
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\sqlite\\vendor\\sqlite3.c">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\sqlite\\vendor\\sqlite3.c"><PrecompiledHeader>NotUsing</PrecompiledHeader><CompileAs>CompileAsC</CompileAs></ClCompile>',
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\transfer\\Transfer.cpp">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\transfer\\Transfer.cpp"><PrecompiledHeader>NotUsing</PrecompiledHeader></ClCompile>',
      );
      xml = insertOnce(
        xml,
        '<ClCompile Include="..\\..\\native\\audio\\proxy\\StreamProxy.cpp">',
        hostCompile,
        '\n    <ClCompile Include="..\\..\\native\\audio\\proxy\\StreamProxy.cpp"><PrecompiledHeader>NotUsing</PrecompiledHeader></ClCompile>',
      );
      if (!xml.includes('Name="RaynaCopyBass"')) {
        const target = `  <Target Name="RaynaCopyBass" AfterTargets="Build">\n    <ItemGroup>\n      <RaynaBassLibrary Include="$(MSBuildThisFileDirectory)..\\..\\..\\vendor\\bass\\win32\\x64\\*.dll" />\n    </ItemGroup>\n    <Copy SourceFiles="@(RaynaBassLibrary)" DestinationFolder="$(OutDir)" SkipUnchangedFiles="true" />\n    <Copy SourceFiles="$(MSBuildThisFileDirectory)..\\..\\native\\audio\\proxy\\vendor\\LICENSE" DestinationFiles="$(OutDir)cpp-httplib-LICENSE.txt" SkipUnchangedFiles="true" />\n  </Target>\n`;
        if (!xml.includes("</Project>"))
          throw new Error("Rayna BASS could not update the Windows project");
        xml = xml.replace("</Project>", `${target}</Project>`);
      }
      if (
        !xml.includes('DestinationFiles="$(OutDir)cpp-httplib-LICENSE.txt"')
      ) {
        const pattern =
          /(<Target Name="RaynaCopyBass"[^>]*>)([\s\S]*?)(<\/Target>)/;
        if (!pattern.test(xml))
          throw new Error(
            "Rayna could not update the Windows license resource",
          );
        xml = xml.replace(
          pattern,
          '$1$2\n    <Copy SourceFiles="$(MSBuildThisFileDirectory)..\\..\\native\\audio\\proxy\\vendor\\LICENSE" DestinationFiles="$(OutDir)cpp-httplib-LICENSE.txt" SkipUnchangedFiles="true" />\n  $3',
        );
      }
      await fs.writeFile(project, xml);

      // The executable's output directory is also used without MSIX, but a
      // Desktop Bridge package needs the libraries as explicit package items.
      const packageProject = path.join(
        root,
        "MyApp.Package",
        "MyApp.Package.wapproj",
      );
      let packageXml = await fs.readFile(packageProject, "utf8");
      if (!packageXml.includes('Label="RaynaPackagedBass"')) {
        const anchor =
          '<Import Project="$(WapProjPath)\\Microsoft.DesktopBridge.targets"';
        if (!packageXml.includes(anchor))
          throw new Error(
            "Rayna could not update the Windows packaging project",
          );
        const resources = `  <ItemGroup Label="RaynaPackagedBass">\n    <Content Include="..\\..\\..\\vendor\\bass\\win32\\x64\\*.dll"><Link>%(Filename)%(Extension)</Link></Content>\n    <Content Include="..\\..\\native\\audio\\proxy\\vendor\\LICENSE"><Link>cpp-httplib-LICENSE.txt</Link></Content>\n  </ItemGroup>\n  `;
        packageXml = packageXml.replace(anchor, `${resources}${anchor}`);
      }
      await fs.writeFile(packageProject, packageXml);
      return mod;
    },
  ]);
};
