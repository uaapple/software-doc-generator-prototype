import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../src/config.js";
import { createHermesApp } from "../src/hermes-app.js";
import {
  hashSoftwareDetailBundle,
  SoftwareDetailHermesSkillRegistry
} from "../src/services/software-detail-hermes-skill-registry.js";
import {
  SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
  SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA
} from "../src/services/software-detail-pipeline-contract.js";
import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";

const execFileAsync = promisify(execFile);
const SYNTHETIC_SCHEMA = "software-detail-container-synthetic-artifact/v1";
const ORIGINAL_TEMPLATE_PATH = path.join(
  config.rootDir,
  "skills",
  "hermes",
  "software-detail-runtime",
  "assets",
  "templates",
  "Template_Software_Detailed_Design.docx"
);

function withinWorkspace(workspaceDir, relativePath) {
  const root = path.resolve(workspaceDir);
  const target = path.resolve(root, ...String(relativePath || "").split("/"));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error("合成阶段制品路径越过任务工作区。"), {
      code: "software_detail_synthetic_path_escape"
    });
  }
  return target;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function verifyImageSkillSnapshotFromSyntheticList(job, definition) {
  const registry = job.skillRegistry;
  const stage = registry?.stages?.find((item) => item.stageId === definition.id);
  if (
    registry?.schema !== "software-detail-hermes-skill-registry/v1" ||
    registry?.discovery?.allDiscovered !== true ||
    registry?.stages?.length !== 9 ||
    !stage?.installedPath ||
    !registry?.runtime?.installedPath
  ) {
    throw Object.assign(new Error("合成技能列表对应的九技能镜像快照不完整。"), {
      code: "software_detail_synthetic_skill_snapshot_missing"
    });
  }
  const [stageHash, runtimeHash] = await Promise.all([
    hashSoftwareDetailBundle(stage.installedPath),
    hashSoftwareDetailBundle(registry.runtime.installedPath)
  ]);
  if (
    stageHash !== stage.bundleHash ||
    runtimeHash !== registry.runtime.bundleHash
  ) {
    throw Object.assign(new Error("九技能镜像快照或共享运行时摘要发生漂移。"), {
      code: "software_detail_synthetic_skill_snapshot_drift"
    });
  }
  return { stage, runtime: registry.runtime };
}

async function renderSyntheticDocx(outputPath, job, definition) {
  const templateStat = await fs.stat(ORIGINAL_TEMPLATE_PATH).catch(() => null);
  if (!templateStat?.isFile() || templateStat.size <= 0) {
    throw Object.assign(new Error("镜像内软件详设原始 DOCX 模板不存在。"), {
      code: "software_detail_synthetic_template_missing"
    });
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const python =
    process.env.SOFTWARE_DETAIL_SYNTHETIC_PYTHON ||
    process.env.TCSD_PIPELINE_PYTHON ||
    "/opt/sdg/venv/bin/python";
  const program = [
    "from docx import Document",
    "import sys",
    "source, target, job_id, stage_id = sys.argv[1:5]",
    "document = Document(source)",
    "document.add_heading('软件详设九阶段容器合成验收', level=1)",
    "document.add_paragraph('本文件由测试专用合成阶段执行器生成，不代表真实业务内容验收。')",
    "document.add_paragraph(f'作业编号：{job_id}')",
    "document.add_paragraph(f'完成阶段：{stage_id}')",
    "document.core_properties.title = '软件详设九阶段容器合成验收'",
    "document.core_properties.subject = '仅验证容器、九阶段、技能、租约与制品链路'",
    "document.save(target)"
  ].join("\n");
  await execFileAsync(
    python,
    [
      "-c",
      program,
      ORIGINAL_TEMPLATE_PATH,
      outputPath,
      job.jobId,
      definition.id
    ],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }
  );
}

class SyntheticSoftwareDetailStageExecutor {
  constructor() {
    this.command = "software-detail-synthetic-hermes";
    this.commandArgsPrefix = [];
    this.profile = "synthetic-container";
  }

  async execute(context) {
    const { definition, job, outputArtifacts } = context;
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const attempt =
      job.stages.find((stage) => stage.id === definition.id)?.attempt || 1;
    const snapshot = await verifyImageSkillSnapshotFromSyntheticList(
      job,
      definition
    );

    await writeJson(context.manifestPath, {
      ...context.stageInput,
      schema: SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
      synthetic: true,
      validationScope:
        "仅验证容器、九阶段、真实九技能镜像快照及摘要、租约、HTTP 与 DOCX 制品链路；技能列表和会话编号均为合成替身",
      skill: {
        name: snapshot.stage.name,
        version: snapshot.stage.version,
        bundleHash: snapshot.stage.bundleHash
      },
      runtime: {
        bundleHash: snapshot.runtime.bundleHash
      },
      gatewayLease: {
        workspaceId: context.lease.workspaceId,
        leaseId: context.lease.leaseId,
        ownerJobId: context.lease.ownerJobId,
        matlabSessionId: context.lease.matlabSessionId
      },
      outputArtifacts,
      candidateResultPath: path
        .relative(workspaceDir, context.candidateResultPath)
        .replaceAll(path.sep, "/")
    });

    for (const artifact of outputArtifacts) {
      const targetPath = withinWorkspace(workspaceDir, artifact.relativePath);
      if (artifact.role === "matlab-session-lease") {
        continue;
      }
      if (artifact.role === "detail-design-docx") {
        await renderSyntheticDocx(targetPath, job, definition);
        continue;
      }
      const payload = {
        schema: SYNTHETIC_SCHEMA,
        synthetic: true,
        jobId: job.jobId,
        stageId: definition.id,
        attempt,
        role: artifact.role,
        skill: {
          name: snapshot.stage.name,
          version: snapshot.stage.version,
          bundleHash: snapshot.stage.bundleHash
        },
        runtimeBundleHash: snapshot.runtime.bundleHash,
        matlab: {
          workspaceId: context.lease.workspaceId,
          leaseId: context.lease.leaseId,
          ownerJobId: context.lease.ownerJobId,
          matlabSessionId: context.lease.matlabSessionId
        },
        sourceArtifacts: Array.isArray(context.stageInput?.artifacts)
          ? context.stageInput.artifacts
          : []
      };
      if (artifact.role === "content-check-report") {
        payload.contentPassed = true;
      }
      if (artifact.role === "checked-content") {
        payload.title = "软件详设九阶段容器合成验收";
        payload.sections = [
          {
            heading: "合成链路",
            body: "本内容只用于验证九阶段与最终 DOCX 链路。"
          }
        ];
      }
      if (artifact.role === "artifact-manifest") {
        const docxArtifact = outputArtifacts.find(
          (item) => item.role === "detail-design-docx"
        );
        const docxPath = withinWorkspace(
          workspaceDir,
          docxArtifact.relativePath
        );
        payload.document = {
          role: "detail-design-docx",
          relativePath: docxArtifact.relativePath,
          size: (await fs.stat(docxPath)).size,
          sha256: await sha256File(docxPath),
          templateRelativePath:
            "skills/hermes/software-detail-runtime/assets/templates/Template_Software_Detailed_Design.docx",
          renderer: "python-docx",
          openablePackageCheckedByHost: false
        };
      }
      await writeJson(targetPath, payload);
    }

    const candidate = {
      schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
      jobId: job.jobId,
      stageId: definition.id,
      attempt,
      status: "completed",
      synthetic: true,
      artifacts: outputArtifacts.map((artifact) => ({
        role: artifact.role,
        relativePath: artifact.relativePath
      }))
    };
    await writeJson(context.candidateResultPath, candidate);
    const sessionId = [
      "synthetic",
      job.jobId,
      String(definition.order)
    ].join("-");
    return {
      sessionId,
      profile: this.profile,
      durationMs: 1,
      stdoutBytes: 0,
      stderrBytes: 0
    };
  }
}

const stageExecutor = new SyntheticSoftwareDetailStageExecutor();
const syntheticSkillList = listSoftwareDetailStages()
  .map((stage) => stage.skillName)
  .join("\n");
const skillRegistry = new SoftwareDetailHermesSkillRegistry({
  command: stageExecutor.command,
  profile: stageExecutor.profile,
  sourceRoot: path.join(config.rootDir, "skills", "hermes"),
  commandRunner: async () => ({
    stdout: `${syntheticSkillList}\n`,
    stderr: ""
  })
});
const app = await createHermesApp({
  softwareDetailStageExecutor: stageExecutor,
  softwareDetailSkillRegistry: skillRegistry
});
const server = app.listen(config.hermes.port, config.hermes.host, () => {
  console.log(
    `[software-detail-container-synthetic] SYNTHETIC Worker listening on ${config.hermes.host}:${config.hermes.port}`
  );
});
server.requestTimeout = 0;
server.timeout = 0;

function shutdown(signal) {
  console.log(
    `[software-detail-container-synthetic] received ${signal}; stopping SYNTHETIC Worker`
  );
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
