import { Display } from "./display.js";
import { Keyboard } from "./keyboard.js";
import { Dispatcher } from "./dispatcher.js";
import { Machine } from "./machine.js";
import { ProgramController } from "./program.js";
import { Storage } from "./storage.js";
import { Debug } from "./debug.js";

/**
 * Initialize the zCalc calculator.
 * Creates all components and wires them together.
 */
function initCalculator() {
  const display = new Display();

  // Create the global state object used by all components
  const state = {
    display: display,
    keyboard: null,
    dispatcher: null,
    machine: null,
    pgrm: null,
    storage: null,
    debug: null,
  };
  window._calculatorState = state;

  // Create machine first (needed by dispatcher)
  state.machine = new Machine();
  state.dispatcher = new Dispatcher();
  state.pgrm = new ProgramController();
  state.storage = new Storage();

  const dispatchKey = (keyCode) => {
    state.dispatcher.dispatch(
      keyCode,
      state.machine,
      state.keyboard,
      state.pgrm,
      state.debug,
    );
  };

  // Create keyboard with dispatch callback
  state.keyboard = new Keyboard(dispatchKey);

  // Debug needs the format function bound to display context
  state.debug = new Debug((value) => {
    return display.formatResult(
      value,
      state.machine.decimals,
      state.machine.notation,
      state.machine.comma,
    );
  });

  // Wire data-key buttons to dispatcher
  document.querySelectorAll("[data-key]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const keyCode = parseInt(btn.dataset.key, 10);
      if (state.keyboard.enabled()) {
        dispatchKey(keyCode);
      }
    });
  });

  // Initialize calculator state
  state.machine.init();
  state.storage.load();
  state.machine.display_all();
  state.machine.sti();

  // Save state on page unload
  let closeDone = false;
  const saveOnClose = () => {
    if (!closeDone) {
      state.storage.save();
      closeDone = true;
    }
  };
  window.onunload = saveOnClose;
  window.onbeforeunload = saveOnClose;
  document.onunload = saveOnClose;
}

// --- Service Worker Registration ---

if ("serviceWorker" in navigator) {
  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register("sw.js", {
        scope: "./",
      });
      if (registration.installing) {
        console.log("Service worker installing");
      } else if (registration.waiting) {
        console.log("Service worker installed");
      } else if (registration.active) {
        console.log("Service worker active");
      }
    } catch (error) {
      console.error(`Service worker registration failed: ${error}`);
    }
  };

  registerServiceWorker();

  if (screen.lock) {
    screen.lock("landscape");
  }

  setTimeout(() => {
    initCalculator();
  }, 100);
}
