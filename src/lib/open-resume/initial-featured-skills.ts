import type { FeaturedSkill } from "@/src/lib/open-resume/resume-types";

/** Default featured skill slots (from OpenResume resumeSlice). */
export const initialFeaturedSkills: FeaturedSkill[] = Array.from({ length: 6 }, () => ({
  skill: "",
  rating: 4,
}));
