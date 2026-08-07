/**
 * Worker 端流水线作业串行门。
 *
 * TCSD / 软件详设流水线作业按设计应串行执行（HERMES_TASK_CONCURRENCY=1）：
 * 每个作业独立持有 MATLAB 会话与 Hermes 会话，并行执行会放大资源占用并破坏
 * “前一阶段完成后的状态落盘/会话切换”的可预期性。本门以 FIFO 队列保证同一
 * Worker 上同时只有一个流水线作业进入执行，其余作业保持 等待执行 状态。
 */
export class SerialGate {
  constructor(options = {}) {
    this.concurrency = Math.max(1, Number(options.concurrency || 1) || 1);
    this.active = 0;
    this.queue = [];
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}
