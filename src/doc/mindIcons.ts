import {
  Activity,
  Armchair,
  Bath,
  BedDouble,
  CircleCheck,
  Coffee,
  Footprints,
  GlassWater,
  Laptop,
  Package,
  PersonStanding,
  Smartphone,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { MindIcon } from "./postures";

/** 「意識していくこと」のアイコン（lucide / ISC ライセンス） */
export const MIND_ICON_COMPONENTS: Record<MindIcon, LucideIcon> = {
  desk: Laptop,
  break: Coffee,
  phone: Smartphone,
  sit: Armchair,
  stand: PersonStanding,
  lift: Package,
  sleep: BedDouble,
  bath: Bath,
  water: GlassWater,
  breath: Wind,
  walk: Activity,
  shoes: Footprints,
  check: CircleCheck,
};
