const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { freshProject } = require(path.resolve(__dirname, "../app/studio/model.ts"));
const {
  applyTransition,
  defaultTransition,
  easings,
  ease,
  layerMotion,
  motionGroups,
  projectTransitions,
  sampleMotion,
  safeTransition,
  validateMotion,
} = require(path.resolve(__dirname, "../app/studio/motion.ts"));

for (const easing of easings) {
  assert.equal(ease(0, easing), 0, `${easing} begins at zero`);
  assert.equal(ease(1, easing), 1, `${easing} ends at one`);
  assert.ok(Number.isFinite(ease(0.43, easing)), `${easing} stays finite`);
}

const motion = {
  start: 3,
  end: 9,
  entrance: { ...defaultTransition(), style: "Fade", duration: 1 },
  exit: { ...defaultTransition(), style: "Zoom", duration: 1 },
};
assert.deepEqual(sampleMotion(motion, 2.99, 12), { visible: false, samples: [] });
assert.equal(sampleMotion(motion, 3, 12).samples[0].progress, 0);
assert.equal(sampleMotion(motion, 3.5, 12).samples[0].progress, 0.5);
assert.equal(sampleMotion(motion, 4.1, 12).samples.length, 0, "completed entrance returns to the unchanged layer transform");
assert.equal(sampleMotion(motion, 8.5, 12).samples[0].progress, 0.5);
assert.deepEqual(sampleMotion(motion, 9, 12), { visible: false, samples: [] });
assert.deepEqual(sampleMotion(motion, 3.5, 12), sampleMotion(motion, 3.5, 12), "seeking to a timestamp is deterministic");

const delayed = { ...motion, entrance: { ...motion.entrance, delay: 0.25 } };
assert.equal(sampleMotion(delayed, 3.1, 12).visible, false);
assert.equal(sampleMotion(delayed, 3.25, 12).samples[0].progress, 0);
assert.equal(validateMotion(motion, 12), null);
assert.ok(validateMotion({ ...motion, end: 4 }, 12), "overlapping transitions are rejected");
assert.ok(validateMotion({ ...motion, start: -1 }, 12), "out of range layer start is rejected");

const unsafe = safeTransition({ style: "unknown", duration: Number.POSITIVE_INFINITY, blur: 100, direction: "sideways" });
assert.equal(unsafe.style, "None");
assert.equal(unsafe.duration, 1);
assert.equal(unsafe.blur, 12);
assert.equal(unsafe.direction, "Left");

const oldText = {
  ...freshProject("motion-test").layers.find(layer => layer.kind === "text"),
  motion: undefined,
  settings: { text: "Legacy", entrance: "Typewriter", duration: 2, easing: "Ease out" },
};
assert.equal(layerMotion(oldText).entrance.style, "Text reveal");
const oldProject = { ...freshProject("legacy-test"), transitions: undefined, effects: { intro: "Open horizontal", outro: "Fade", transitionDuration: 0.8 } };
assert.equal(projectTransitions(oldProject).intro.style, "Center reveal");
assert.equal(projectTransitions(oldProject).intro.direction, "Left");

let clipped = 0;
const context = {
  globalAlpha: 1,
  filter: "none",
  getTransform: () => ({ a: 1, b: 0 }),
  translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() { clipped++; },
};
for (const style of Object.values(motionGroups).flat().filter(style => style !== "None")) {
  applyTransition(context, { ...defaultTransition(), style }, 0.5, 320, 180);
}
assert.ok(clipped >= 7, "wipe, iris, dissolve and shutter families clip deterministically");

console.log("Studio motion checks passed.");
