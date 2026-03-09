/**
 * Debug utilities for inspecting calculator memory.
 * Opens a separate window showing register contents.
 */
export class Debug {
  constructor(formatResultFn) {
    this.memoryWindow = null;
    this.formatResult = formatResultFn;
  }

  /**
   * Update the memory debug window contents.
   */
  updateMemoryDisplay() {
    if (!this.memoryWindow || !this.memoryWindow.document) {
      this.memoryWindow = null;
      return;
    }

    const state = window._calculatorState;
    const doc = this.memoryWindow.document;
    const titleEl = doc.getElementById("tt");

    if (titleEl) {
      titleEl.innerHTML = "zCalc memory at " + new Date();

      // Financial registers
      for (let i = 0; i < state.machine.finmemory.length; ++i) {
        const el = doc.getElementById("finmemory" + i);
        if (el) el.innerHTML = this.formatResult(state.machine.finmemory[i]);
      }

      // Storage registers
      for (let i = 0; i < state.machine.stomemory.length; ++i) {
        const el = doc.getElementById("stomemory" + i);
        if (el) el.innerHTML = this.formatResult(state.machine.stomemory[i]);
      }

      // Cash flow counts
      for (let i = 0; i < state.machine.njmemory.length; ++i) {
        const el = doc.getElementById("njmemory" + i);
        if (el) el.innerHTML = this.formatResult(state.machine.njmemory[i]);
      }

      // Stack registers
      doc.getElementById("x").innerHTML = this.formatResult(state.machine.x);
      doc.getElementById("last_x").innerHTML = this.formatResult(
        state.machine.last_x,
      );
      doc.getElementById("y").innerHTML = this.formatResult(state.machine.y);
      doc.getElementById("z").innerHTML = this.formatResult(state.machine.z);
      doc.getElementById("w").innerHTML = this.formatResult(state.machine.w);

      // Program memory
      for (let i = 0; i < state.machine.ram.length; ++i) {
        const el = doc.getElementById("ram" + i);
        if (el) el.innerHTML = state.machine.ram[i];
      }
    }

    setTimeout(() => this.updateMemoryDisplay(), 1000);
  }

  /**
   * Open the memory debug window.
   */
  show_memory() {
    this.memoryWindow = window.open("zcalc_memory.html");
    setTimeout(() => this.updateMemoryDisplay(), 1000);
  }
}
