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
            yield return new WaitForEndOfFrame();
            string file = Path.Combine(output, (shortRoute ? "short-" : "long-") + name + ".png");
            ScreenCapture.CaptureScreenshot(file);
            float deadline = Time.realtimeSinceStartup + 12f;
            while (!File.Exists(file) && Time.realtimeSinceStartup < deadline) yield return null;
            yield return new WaitForSecondsRealtime(0.3f);
        }
    }
}
