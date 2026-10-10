// Registry of zone files. To add a room: drop <id>.json into ./zones and add one import line here.
// world-data.test.ts fails if a file exists in ./zones but is not listed (or vice versa).
import world from "./world.json";
import assets from "./assets.json";
import main_gate from "./zones/main_gate.json";
import student_commons from "./zones/student_commons.json";
import academic_block from "./zones/academic_block.json";
import hostel_street from "./zones/hostel_street.json";
import food_court from "./zones/food_court.json";
import library from "./zones/library.json";
import sports_ground from "./zones/sports_ground.json";
import creator_hub from "./zones/creator_hub.json";
import event_arena from "./zones/event_arena.json";

export const WORLD_JSON: unknown = world;
export const ZONE_JSON: Record<string, unknown> = {
  main_gate, student_commons, academic_block, hostel_street, food_court, library, sports_ground, creator_hub, event_arena,
};
export const ASSET_MANIFEST_JSON: unknown = assets;
