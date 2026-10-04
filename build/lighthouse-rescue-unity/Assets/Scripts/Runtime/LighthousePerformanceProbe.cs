using System;
using System.Collections.Generic;
using LighthouseRescue.Rules;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace LighthouseRescue.Runtime
{
    // Explicit browser-smoke instrumentation. Normal play never creates this component.
    public sealed class LighthousePerformanceProbe : MonoBehaviour
    {
        [Serializable]
        private sealed class FrameStats
        {
            public string phase;
            public int sampleCount;
            public float meanFrameMs;
            public float meanFps;
            public float p95FrameMsUpperBound;
            public float maxFrameMs;
            public int slowFrameCount;
        }

        [Serializable]
        private sealed class Report
        {
            public string source = "Unity.Time.unscaledDeltaTime";
            public string phase;
            public string route;
            public string outcome;
            public int saved;
            public FrameStats total;
            public FrameStats[] phases;
        }

        private sealed class FrameAccumulator
        {
            private static readonly float[] BucketUpperMs = { 16.7f, 33.3f, 50f, 100f, 250f };
            private readonly int[] bucketCounts = new int[BucketUpperMs.Length + 1];
            private int sampleCount;
            private int slowFrameCount;
            private float frameTimeTotalMs;
            private float maxFrameMs;

            public int SampleCount => sampleCount;

            public void Add(float frameMs)
            {
                sampleCount++;
                frameTimeTotalMs += frameMs;
                maxFrameMs = Mathf.Max(maxFrameMs, frameMs);
                if (frameMs > 50f) slowFrameCount++;
                int bucket = 0;
                while (bucket < BucketUpperMs.Length && frameMs > BucketUpperMs[bucket]) bucket++;
                bucketCounts[bucket]++;
            }

            public FrameStats Summarize(string phase)
            {
                float meanMs = sampleCount == 0 ? 0f : frameTimeTotalMs / sampleCount;
                return new FrameStats
                {
                    phase = phase,
                    sampleCount = sampleCount,
                    meanFrameMs = meanMs,
                    meanFps = meanMs > 0f ? 1000f / meanMs : 0f,
                    p95FrameMsUpperBound = PercentileUpperBound(),
                    maxFrameMs = maxFrameMs,
                    slowFrameCount = slowFrameCount
                };
            }

            private float PercentileUpperBound()
            {
                if (sampleCount == 0) return 0f;
                int rank = Mathf.CeilToInt(sampleCount * 0.95f);
                int cumulative = 0;
                for (int i = 0; i < bucketCounts.Length; i++)
                {
                    cumulative += bucketCounts[i];
                    if (cumulative >= rank)
                        return i < BucketUpperMs.Length ? BucketUpperMs[i] : maxFrameMs;
                }
                return maxFrameMs;
            }
        }

        private readonly FrameAccumulator total = new FrameAccumulator();
        private readonly FrameAccumulator[] byPhase = new FrameAccumulator[Enum.GetValues(typeof(GamePhase)).Length];
        private RescueController controller;
        private float nextPublishAt;
        private GamePhase lastPhase = (GamePhase)(-1);

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void LighthouseMetricsPublish(string json);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void BeginOnlyWhenRequested()
        {
            if (!Requested(Application.absoluteURL)) return;
            var target = UnityEngine.Object.FindObjectOfType<RescueController>();
            if (target == null)
            {
                Debug.LogError("Lighthouse metrics requested but RescueController is absent");
                return;
            }
            target.gameObject.AddComponent<LighthousePerformanceProbe>().controller = target;
        }
#endif

        private static bool Requested(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;
            int queryStart = url.IndexOf('?');
            if (queryStart < 0) return false;
            int fragmentStart = url.IndexOf('#', queryStart);
            string query = url.Substring(queryStart + 1,
                (fragmentStart < 0 ? url.Length : fragmentStart) - queryStart - 1);
            foreach (string parameter in query.Split('&'))
                if (parameter == "lighthouseMetrics=1") return true;
            return false;
        }

        private void Update()
        {
            if (controller == null) return;
            RescueSnapshot snapshot = controller.Current;
            if (snapshot == null) return;
            float frameMs = Time.unscaledDeltaTime * 1000f;
            if (frameMs > 0f && !float.IsNaN(frameMs) && !float.IsInfinity(frameMs))
            {
                total.Add(frameMs);
                int phaseIndex = (int)snapshot.Phase;
                if (phaseIndex >= 0 && phaseIndex < byPhase.Length)
                {
                    if (byPhase[phaseIndex] == null) byPhase[phaseIndex] = new FrameAccumulator();
                    byPhase[phaseIndex].Add(frameMs);
                }
            }

            if (snapshot.Phase != lastPhase || Time.unscaledTime >= nextPublishAt)
            {
                lastPhase = snapshot.Phase;
                nextPublishAt = Time.unscaledTime + 0.5f;
                Publish(snapshot);
            }
        }

        private void Publish(RescueSnapshot snapshot)
        {
            var phases = new List<FrameStats>();
            for (int i = 0; i < byPhase.Length; i++)
                if (byPhase[i] != null && byPhase[i].SampleCount > 0)
                    phases.Add(byPhase[i].Summarize(((GamePhase)i).ToString()));
            var report = new Report
            {
                phase = snapshot.Phase.ToString(),
                route = snapshot.Route.ToString(),
                outcome = snapshot.Outcome.ToString(),
                saved = snapshot.SavedCount,
                total = total.Summarize("All"),
                phases = phases.ToArray()
            };
#if UNITY_WEBGL && !UNITY_EDITOR
            LighthouseMetricsPublish(JsonUtility.ToJson(report));
#endif
        }
    }
}
