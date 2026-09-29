using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;
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
    }
}
