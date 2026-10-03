using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildLighthouse
{
    private const string Scene = "Assets/Scenes/LighthouseRescue.unity";

    [MenuItem("Lighthouse Rescue/Build Windows x64")]
    public static void BuildWindows()
    {
        var output = Environment.GetEnvironmentVariable("LIGHTHOUSE_BUILD_DIR");
        if (string.IsNullOrWhiteSpace(output)) output = Path.GetFullPath("../../.superpowers/sdd/2026-09-29-lighthouse-rescue/windows-build");
        Directory.CreateDirectory(output);
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone, ScriptingImplementation.Mono2x);
        PlayerSettings.stripEngineCode = true;
        Build(output, BuildTarget.StandaloneWindows64, Path.Combine(output, "LighthouseRescue.exe"));
    }

    [MenuItem("Lighthouse Rescue/Build WebGL")]
    public static void BuildWebGL()
    {
        var output = Environment.GetEnvironmentVariable("LIGHTHOUSE_BUILD_DIR");
        if (string.IsNullOrWhiteSpace(output)) output = Path.GetFullPath("../../projects/lighthouse-rescue/game");
        Directory.CreateDirectory(output);
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
        PlayerSettings.stripEngineCode = true;
        Build(output, BuildTarget.WebGL, output);
        var page = Path.Combine(output, "index.html");
        const string disabled = "// config.autoSyncPersistentDataPath = true;";
        if (!File.Exists(page) || !File.ReadAllText(page).Contains(disabled))
            throw new Exception("Unity WebGL template no longer exposes persistent-data autosync");
        File.WriteAllText(page, File.ReadAllText(page).Replace(disabled,
            "config.autoSyncPersistentDataPath = true;"));
    }

    private static void Build(string folder, BuildTarget target, string location)
    {
        if (!File.Exists(Scene)) throw new FileNotFoundException("Playable scene missing", Scene);
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { Scene }, locationPathName = location,
            target = target, options = BuildOptions.None
        });
        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("Lighthouse " + target + " build failed: " + report.summary.result + ", " + report.summary.totalErrors + " errors");
        Debug.Log("LIGHTHOUSE_BUILD_OK " + target + " " + location + " " + report.summary.totalSize);
    }
}
