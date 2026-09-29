using System.IO;
using LighthouseRescue.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class LighthouseSceneBuilder
{
    private const string ScenePath = "Assets/Scenes/LighthouseRescue.unity";

    [MenuItem("Lighthouse Rescue/Create playable scene")]
    public static void CreateScene()
    {
        Directory.CreateDirectory("Assets/Scenes");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var camera = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
        camera.tag = "MainCamera";
        camera.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
        camera.GetComponent<Camera>().backgroundColor = new Color(0.047f, 0.125f, 0.2f);
        new GameObject("Lighthouse Rescue Game").AddComponent<RescueController>();
        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        PlayerSettings.productName = "灯塔救援队";
        PlayerSettings.companyName = "Lighthouse Rescue Studio";
        PlayerSettings.defaultScreenWidth = 1080;
        PlayerSettings.defaultScreenHeight = 1920;
        PlayerSettings.resizableWindow = true;
        PlayerSettings.runInBackground = true;
        PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Standalone, "com.lighthouserescue.demo");
        AssetDatabase.SaveAssets();
        Debug.Log("LIGHTHOUSE_SCENE_CREATED " + ScenePath);
    }
}
