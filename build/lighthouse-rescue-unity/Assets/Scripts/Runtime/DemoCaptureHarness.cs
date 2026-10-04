using System;
using System.Collections;
using System.IO;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    // Optional command-line smoke harness for the packaged player. Never starts in normal play.
    public sealed class DemoCaptureHarness : MonoBehaviour
    {
        private RescueController controller;
        private bool shortRoute;
        private string output;

        public void Begin(RescueController target, bool useShortRoute)
        {
            controller = target;
            shortRoute = useShortRoute;
            output = Environment.GetEnvironmentVariable("LIGHTHOUSE_CAPTURE_DIR");
            if (string.IsNullOrWhiteSpace(output)) output = Path.Combine(Application.persistentDataPath, "capture");
            Directory.CreateDirectory(output);
            StartCoroutine(PlayAndCapture());
        }

        private IEnumerator PlayAndCapture()
        {
            controller.SetCaptureSpeed();
            controller.StartOrRestart();
            controller.Emit(GameCommand.Board, "captured-viewer");
            yield return Capture("01-gathering");
            yield return WaitFor(GamePhase.Voting);
            controller.Emit(shortRoute ? GameCommand.VoteLeft : GameCommand.VoteRight, "captured-viewer");
            yield return Capture("02-voting");
            for (int stage = 1; stage <= 3; stage++)
            {
                yield return WaitFor((GamePhase)((int)GamePhase.Checkpoint1 + stage - 1));
                for (int i = 0; i < 4; i++)
                {
                    controller.Emit(GameCommand.Repair, "crew-repair-" + stage + "-" + i);
                    controller.Emit(GameCommand.Light, "crew-light-" + stage + "-" + i);
                }
                yield return Capture("0" + (stage + 2) + "-checkpoint");
            }
            yield return WaitFor(GamePhase.Finale);
            yield return Capture("06-finale");
            yield return WaitFor(GamePhase.Result);
            yield return Capture("07-result");
            File.WriteAllText(Path.Combine(output, "result.txt"),
                "Route=" + controller.Current.Route + "\nOutcome=" + controller.Current.Outcome +
                "\nSaved=" + controller.Current.SavedCount + "\nHull=" + controller.Current.Hull);
            yield return new WaitForSecondsRealtime(1f);
            Application.Quit(0);
        }

        private IEnumerator WaitFor(GamePhase phase)
        {
            float deadline = Time.realtimeSinceStartup + 90f;
            while (controller.Current.Phase != phase && Time.realtimeSinceStartup < deadline)
            {
                if (controller.Current.Phase == GamePhase.Result && phase != GamePhase.Result) break;
                yield return null;
            }
            if (controller.Current.Phase != phase)
                throw new Exception("Capture playthrough did not reach " + phase + "; stopped at " + controller.Current.Phase);
        }

        private IEnumerator Capture(string name)
        {
            string file = Path.Combine(output, (shortRoute ? "short-" : "long-") + name + ".png");
            var canvasObject = GameObject.Find("Lighthouse rescue 9:16 canvas");
            var canvas = canvasObject == null ? null : canvasObject.GetComponent<Canvas>();
            if (canvas == null) throw new Exception("Capture canvas is unavailable");

            RenderMode previousMode = canvas.renderMode;
            Camera previousCamera = canvas.worldCamera;
            float previousPlaneDistance = canvas.planeDistance;
            RenderTexture previousActive = RenderTexture.active;
            RenderTexture target = null;
            Texture2D pixels = null;
            GameObject cameraObject = null;
            try
            {
                target = new RenderTexture(1080, 1920, 24, RenderTextureFormat.ARGB32);
                if (!target.Create()) throw new Exception("Offscreen capture target could not be created");
                cameraObject = new GameObject("Lighthouse offscreen capture camera");
                var camera = cameraObject.AddComponent<Camera>();
                camera.enabled = false;
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.black;
                camera.orthographic = true;
                camera.transform.position = new Vector3(0f, 0f, -10f);
                camera.nearClipPlane = 0.01f;
                camera.farClipPlane = 100f;
                camera.targetTexture = target;

                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = camera;
                canvas.planeDistance = 1f;
                yield return null; // Let Unity register the camera-space canvas before rendering it.
                yield return new WaitForEndOfFrame();
                Canvas.ForceUpdateCanvases();
                camera.Render();

                RenderTexture.active = target;
                pixels = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
                pixels.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
                pixels.Apply();
                bool hasVisiblePixels = false;
                for (int y = 0; y < 8 && !hasVisiblePixels; y++)
                    for (int x = 0; x < 8 && !hasVisiblePixels; x++)
                        hasVisiblePixels = pixels.GetPixel((x * 2 + 1) * target.width / 16,
                            (y * 2 + 1) * target.height / 16).maxColorComponent > 0.01f;
                if (!hasVisiblePixels) throw new Exception("Offscreen capture rendered a blank image");
                File.WriteAllBytes(file, pixels.EncodeToPNG());
            }
            finally
            {
                RenderTexture.active = previousActive;
                try
                {
                    if (canvas != null)
                    {
                        canvas.renderMode = previousMode;
                        canvas.worldCamera = previousCamera;
                        canvas.planeDistance = previousPlaneDistance;
                        Canvas.ForceUpdateCanvases();
                    }
                }
                finally
                {
                    if (pixels != null) Destroy(pixels);
                    if (cameraObject != null)
                    {
                        cameraObject.GetComponent<Camera>().targetTexture = null;
                        Destroy(cameraObject);
                    }
                    if (target != null)
                    {
                        target.Release();
                        Destroy(target);
                    }
                }
            }
            yield return new WaitForSecondsRealtime(0.3f);
        }
    }
}
