import { createEvaluationV3RouteDependencies } from './evaluationV3/routes';

const main = async () => {
  const repetitions = process.argv.includes('--repetitions=5') ? 5 : 1;
  const { runner } = createEvaluationV3RouteDependencies(process.cwd());
  const launch = await runner.createExperiment({ repetitions });
  console.log(JSON.stringify({
    event: 'EXPERIMENT_CREATED',
    experimentGroupId: launch.experimentGroupId,
    runIds: launch.runs.map(({ runId }) => runId),
  }));
  const runs = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  console.log(JSON.stringify({ event: 'EXPERIMENT_COMPLETED', runs }));
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
