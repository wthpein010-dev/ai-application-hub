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
            }
            finally
            {
                foreach (var canvas in Object.FindObjectsOfType<Canvas>()) Object.DestroyImmediate(canvas.gameObject);
                Object.DestroyImmediate(owner);
            }
        }
    }
}
