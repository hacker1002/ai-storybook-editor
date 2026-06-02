// remotion/index.ts
// Remotion entry point. bundle({ entryPoint }) in the worker points here; registerRoot
// wires the composition tree into Remotion's webpack runtime. Keep this file side-effect
// minimal — only registerRoot.

import { registerRoot } from "remotion";
import "./load-fonts"; // side-effect: register + gate Nunito before frame 0
import { RemotionRoot } from "./root";

registerRoot(RemotionRoot);
