using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace LighthouseRescue.Tests
{
    public sealed class RescueViewTests
    {
        [Test]
        public void RescueCameraUsesPOVForEveryCheckpointAndPauseFromCheckpoint()
        {
            foreach (var phase in new[] { GamePhase.Checkpoint1, GamePhase.Checkpoint2, GamePhase.Checkpoint3 })
                Assert.That(RescueView.IsRescuePOV(new RescueSnapshot { Phase = phase }), Is.True, phase.ToString());
            Assert.That(RescueView.IsRescuePOV(new RescueSnapshot
                { Phase = GamePhase.Paused, PhaseBeforePause = GamePhase.Checkpoint2 }), Is.True);
            foreach (var phase in new[] { GamePhase.Waiting, GamePhase.Gathering, GamePhase.Voting,
                GamePhase.Finale, GamePhase.Result })
                Assert.That(RescueView.IsRescuePOV(new RescueSnapshot { Phase = phase }), Is.False, phase.ToString());
            Assert.That(RescueView.IsRescuePOV(new RescueSnapshot
                { Phase = GamePhase.Paused, PhaseBeforePause = GamePhase.Voting }), Is.False);
        }

        [Test]
        public void EachCheckpointShowsItsOwnPOVArtAndHidesTheOverheadBoat()
        {
            var owner = new GameObject("pov-selection-test");
            try
            {
                var view = owner.AddComponent<RescueView>();
                view.Build(owner.AddComponent<HostControls>());
                for (int stage = 1; stage <= 3; stage++)
                {
                    var phase = (GamePhase)((int)GamePhase.Checkpoint1 + stage - 1);
                    view.Render(new RescueSnapshot { Phase = phase, CheckpointNumber = stage, Hull = 100 });
                    var scene = GameObject.Find("First-person rescue " + stage);
                    Assert.That(scene, Is.Not.Null);
                    Assert.That(scene.GetComponentInParent<RectMask2D>(), Is.Not.Null, "POV zoom must stay inside sea frame");
                    Assert.That(scene.GetComponent<RectTransform>().rect.width, Is.GreaterThan(984f), "survivor must read at phone size");
                    Assert.That(GameObject.Find("Rescue ship"), Is.Null);
                    Assert.That(Resources.Load<Texture2D>("Art/RescuePOV" + stage), Is.Not.Null);
                }
                view.Render(new RescueSnapshot { Phase = GamePhase.Voting, Hull = 100 });
                Assert.That(GameObject.Find("Rescue ship"), Is.Not.Null);
                Assert.That(GameObject.Find("First-person rescue 1"), Is.Null);
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void StormBuildsPooledRainAndSprayAndGetsStrongerAcrossRescues()
        {
            var owner = new GameObject("storm-pool-test");
            try
            {
                var view = owner.AddComponent<RescueView>();
                view.Build(owner.AddComponent<HostControls>());
                Assert.That(GameObject.Find("Storm rain 47"), Is.Not.Null);
                Assert.That(GameObject.Find("Storm spray 17"), Is.Not.Null);
                var canvas = Object.FindObjectOfType<Canvas>();
                int pooledCount = canvas.GetComponentsInChildren<RectTransform>(true).Length;
                var early = new RescueSnapshot { Phase = GamePhase.Checkpoint1, CheckpointNumber = 1, Hull = 100 };
                var late = new RescueSnapshot { Phase = GamePhase.Checkpoint3, CheckpointNumber = 3, Hull = 100 };
                Assert.That(RescueView.StormIntensity(late), Is.GreaterThan(RescueView.StormIntensity(early)));
                for (int i = 0; i < 5; i++) view.Render(late);
                Assert.That(canvas.GetComponentsInChildren<RectTransform>(true).Length, Is.EqualTo(pooledCount));
                var paused = new RescueSnapshot { Phase = GamePhase.Paused, PhaseBeforePause = GamePhase.Checkpoint3,
                    CheckpointNumber = 3, Hull = 100 };
                Assert.That(RescueView.StormIntensity(paused), Is.EqualTo(RescueView.StormIntensity(late)));
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void MuteSilencesStormAmbienceAlongWithInteractionSounds()
        {
            var owner = new GameObject("storm-audio-test");
            try
            {
                var host = owner.AddComponent<HostControls>();
                var view = owner.AddComponent<RescueView>();
                view.Build(host);
                var storm = owner.GetComponents<AudioSource>().Single(source => source.loop);
                Assert.That(storm.clip, Is.Not.Null);
                var snapshot = new RescueSnapshot { Phase = GamePhase.Checkpoint2, CheckpointNumber = 2, Hull = 100 };
                view.Render(snapshot);
                Assert.That(storm.volume, Is.GreaterThan(0f));
                host.ToggleMute();
                view.Render(snapshot);
                Assert.That(storm.volume, Is.EqualTo(0f));
                host.ToggleMute();
                view.Render(snapshot);
                Assert.That(storm.volume, Is.GreaterThan(0f));
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void StageCopyShowsActionAndNeverClaimsLiveConnection()
        {
            var snapshot = new RescueSnapshot { Phase = GamePhase.Voting, RemainingSeconds = 12 };
            StringAssert.Contains("左", RescueView.DescribeStage(snapshot));
            StringAssert.Contains("右", RescueView.DescribeStage(snapshot));
            snapshot.Phase = GamePhase.Checkpoint2;
            snapshot.CheckpointNumber = 2;
            StringAssert.Contains("修理", RescueView.DescribeStage(snapshot));
            StringAssert.Contains("照明", RescueView.DescribeStage(snapshot));
        }

        [TestCase(GameOutcome.FullSuccess, "3 人")]
        [TestCase(GameOutcome.PartialSuccess, "部分")]
        [TestCase(GameOutcome.Failure, "失败")]
        public void EndingCopyDistinguishesThreeOutcomes(GameOutcome outcome, string expected)
        {
            StringAssert.Contains(expected, RescueView.DescribeEnding(outcome));
        }

        [TestCase(GameCommand.Board, "上船成功")]
        [TestCase(GameCommand.VoteLeft, "左路投票已计入")]
        [TestCase(GameCommand.Repair, "修理已计入")]
        [TestCase(GameCommand.Light, "照明已计入")]
        [TestCase(GameCommand.Gift, "礼物只点亮烟花，不影响胜负")]
        public void AcceptedFeedbackUsesClearChinesePlayerCopy(GameCommand command, string expected)
        {
            var owner = new GameObject("feedback-copy-test");
            try
            {
                var view = owner.AddComponent<RescueView>();
                view.Build(owner.AddComponent<HostControls>());
                view.ShowFeedback(command, ApplyResult.Accepted);
                Assert.That(Object.FindObjectsOfType<Text>().Any(label => label.text == expected), Is.True);
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void EveryActionButtonReceivesPointerRaycasts()
        {
            var owner = new GameObject("view-test");
            try
            {
                var host = owner.AddComponent<HostControls>();
                owner.AddComponent<RescueView>().Build(host);
                var buttons = Object.FindObjectsOfType<Button>();
                Assert.GreaterOrEqual(buttons.Length, 10);
                foreach (var button in buttons)
                    Assert.IsTrue(button.targetGraphic.raycastTarget, button.name + " cannot receive pointer clicks");
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void CaptainCanResolveTiedRouteFromVisibleControlsOnlyDuringVoting()
        {
            var owner = new GameObject("captain-controls-test");
            try
            {
                var host = owner.AddComponent<HostControls>();
                var view = owner.AddComponent<RescueView>();
                view.Build(host);
                var left = GameObject.Find("船长裁定左 button")?.GetComponent<Button>();
                var right = GameObject.Find("船长裁定右 button")?.GetComponent<Button>();
                Assert.That(left, Is.Not.Null);
                Assert.That(right, Is.Not.Null);
                view.Render(new RescueSnapshot { Phase = GamePhase.Waiting });
                Assert.That(left.interactable || right.interactable, Is.False);
                Assert.That(left.gameObject.activeInHierarchy || right.gameObject.activeInHierarchy, Is.False);
                view.Render(new RescueSnapshot { Phase = GamePhase.Voting });
                Assert.That(left.interactable && right.interactable, Is.True);
                Assert.That(left.gameObject.activeInHierarchy && right.gameObject.activeInHierarchy, Is.True);
                Assert.That(left.GetComponent<RectTransform>().rect.height, Is.GreaterThanOrEqualTo(120f));
                Assert.That(right.GetComponent<RectTransform>().rect.height, Is.GreaterThanOrEqualTo(120f));
                Assert.That(GameObject.Find("修理船体 button"), Is.Null);
                Assert.That(GameObject.Find("照明救人 button"), Is.Null);
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void RestoredProgressDoesNotPlayNewRescueOrDamageEffects()
        {
            var owner = new GameObject("recovery-effects-test");
            try
            {
                var view = owner.AddComponent<RescueView>();
                view.Build(owner.AddComponent<HostControls>());
                view.Render(new RescueSnapshot { Phase = GamePhase.Waiting, Hull = 100 });
                var recovered = new RescueSnapshot { Phase = GamePhase.Checkpoint2, SavedCount = 2, Hull = 54 };
                view.ResetTransitionBaseline(recovered);
                view.Render(recovered);
                Assert.That(GameObject.Find("Hull damage flash").GetComponent<Image>().color.a, Is.EqualTo(0f));
                Assert.That(Object.FindObjectsOfType<Text>().Any(label => label.text.Contains("已救起第 2 位")), Is.False);
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }

        [Test]
        public void CoreInstructionsAndActionsAreLegibleOnPortraitPhones()
        {
            var owner = new GameObject("mobile-legibility-test");
            try
            {
                var view = owner.AddComponent<RescueView>();
                view.Build(owner.AddComponent<HostControls>());
                var snapshot = new RescueSnapshot { Phase = GamePhase.Voting, Hull = 100, RemainingSeconds = 15 };
                view.Render(snapshot);
                var labels = Object.FindObjectsOfType<Text>();
                foreach (var copy in new[] { "上船", "选左 · 短路", "选右 · 长路", "船长裁定左", "船长裁定右" })
                {
                    var label = labels.Single(text => text.text == copy);
                    Assert.That(label.fontSize * 390f / 1080f, Is.GreaterThanOrEqualTo(13.5f), copy);
                }
                Assert.That(labels.Single(text => text.text == RescueView.DescribeStage(snapshot)).fontSize * 390f / 1080f,
                    Is.GreaterThanOrEqualTo(13.5f), "stage instruction");
                Assert.That(labels.Single(text => text.text.StartsWith("左：")).fontSize * 390f / 1080f,
                    Is.GreaterThanOrEqualTo(13f), "route choice");
                Assert.That(labels.Single(text => text.text.StartsWith("已救 ")).fontSize * 390f / 1080f,
                    Is.GreaterThanOrEqualTo(13f), "rescue score");
                foreach (var phase in new[] { GamePhase.Waiting, GamePhase.Gathering, GamePhase.Voting,
                    GamePhase.Checkpoint1, GamePhase.Finale, GamePhase.Paused, GamePhase.Result })
                {
                    snapshot.Phase = phase;
                    view.Render(snapshot);
                    var instruction = labels.Single(text => text.text == RescueView.DescribeStage(snapshot));
                    Assert.That(instruction.preferredHeight, Is.LessThanOrEqualTo(instruction.rectTransform.rect.height + 2f), phase.ToString());
                }
                Assert.That(labels.Single(text => text.text == "本地演示 · 非直播连接").fontSize * 390f / 1080f,
                    Is.GreaterThanOrEqualTo(13f), "simulation mode badge");
                snapshot.SavedCount = 3;
                snapshot.Outcome = GameOutcome.FullSuccess;
                view.Render(snapshot);
                labels = Object.FindObjectsOfType<Text>();
                var summary = labels.Single(text => text.text.StartsWith("救起 3"));
                Assert.That(summary.fontSize * 390f / 1080f, Is.GreaterThanOrEqualTo(13f), "ending summary");
                Assert.That(summary.preferredHeight, Is.LessThanOrEqualTo(summary.rectTransform.rect.height + 2f));
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }
    }
}
