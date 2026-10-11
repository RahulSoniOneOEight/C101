import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  BuildKartCmsClient,
  type CmsCommand,
  type CmsCommandContext,
  type CmsCommandResponse,
} from "../integrations/cms/client";

export interface CmsCommandWorkflowInput {
  command: CmsCommand;
  context: CmsCommandContext;
}

const executeCmsCommandStep = createStep(
  "execute-buildkart-cms-command",
  async (input: CmsCommandWorkflowInput) => {
    const result = await new BuildKartCmsClient().execute(input.command, input.context);
    return new StepResponse<CmsCommandResponse>(result);
  },
);

export const cmsCommandWorkflow = createWorkflow(
  "buildkart-cms-command",
  function (input: CmsCommandWorkflowInput) {
    const result = executeCmsCommandStep(input);
    return new WorkflowResponse(result);
  },
);
