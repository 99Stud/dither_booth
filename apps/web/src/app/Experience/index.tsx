import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

import { CameraStage } from "./internal/components/CameraStage/index";
import { CaptureFlash } from "./internal/components/CaptureFlash/index";
import { IntroChrome } from "./internal/components/IntroChrome/index";
import { PostPrintStage } from "./internal/components/PostPrintStage/index";
import { StartExperienceButton } from "./internal/components/StartExperienceButton/index";
import { KIOSK_INTERACTIVE_BACKGROUND_OPTIONS } from "./internal/Experience.constants";
import { experienceStageClassName } from "./internal/Experience.styles";
import { useExperienceFlow } from "./internal/hooks/useExperienceFlow";

export const Experience = () => {
  const {
    captureFlashId,
    countdown,
    drawResult,
    handleCameraAnimationComplete,
    handlePlayLottery,
    handlePromptAnimationComplete,
    handleStartButtonAnimationComplete,
    handleStartExperience,
    isCameraVisible,
    isIntroDecorationsVisible,
    isPostPrintEnteringInPlace,
    isPostPrintVisible,
    isPromptVisible,
    isStartButtonAtOrigin,
    isStartButtonVisible,
    isStartDisabled,
    lotteryStatus,
    phase,
    promptText,
    webcamRef,
  } = useExperienceFlow();

  return (
    <>
      <InteractiveBackground options={KIOSK_INTERACTIVE_BACKGROUND_OPTIONS} />
      <CaptureFlash captureId={captureFlashId} />
      <IntroChrome
        isVisible={isIntroDecorationsVisible}
        lotteryStatus={lotteryStatus}
      />
      <StartExperienceButton
        disabled={isStartDisabled}
        isAtOrigin={isStartButtonAtOrigin}
        isVisible={isStartButtonVisible}
        onAnimationComplete={handleStartButtonAnimationComplete}
        onStart={handleStartExperience}
      />
      <div className={experienceStageClassName}>
        <CameraStage
          countdown={countdown}
          isCameraVisible={isCameraVisible}
          isPromptVisible={isPromptVisible}
          onCameraAnimationComplete={handleCameraAnimationComplete}
          onPromptAnimationComplete={handlePromptAnimationComplete}
          promptText={promptText}
          webcamRef={webcamRef}
        />
        <PostPrintStage
          drawResult={drawResult}
          entersInPlace={isPostPrintEnteringInPlace}
          isVisible={isPostPrintVisible}
          onPlayLottery={handlePlayLottery}
          phase={phase}
        />
      </div>
    </>
  );
};
