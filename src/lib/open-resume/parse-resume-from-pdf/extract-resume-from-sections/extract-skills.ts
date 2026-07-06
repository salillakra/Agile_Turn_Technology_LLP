import type { ResumeSkills } from "@/src/lib/open-resume/resume-types";
import type { ResumeSectionToLines } from "@/src/lib/open-resume/parse-resume-from-pdf/types";
import { deepClone } from "@/src/lib/open-resume/deep-clone";
import { getSectionLinesByKeywords } from "@/src/lib/open-resume/parse-resume-from-pdf/extract-resume-from-sections/lib/get-section-lines";
import { initialFeaturedSkills } from "@/src/lib/open-resume/initial-featured-skills";
import {
  getBulletPointsFromLines,
  getDescriptionsLineIdx,
} from "@/src/lib/open-resume/parse-resume-from-pdf/extract-resume-from-sections/lib/bullet-points";

export const extractSkills = (sections: ResumeSectionToLines) => {
  const lines = getSectionLinesByKeywords(sections, ["skill"]);
  const descriptionsLineIdx = getDescriptionsLineIdx(lines) ?? 0;
  const descriptionsLines = lines.slice(descriptionsLineIdx);
  const descriptions = getBulletPointsFromLines(descriptionsLines);

  const featuredSkills = deepClone(initialFeaturedSkills);
  if (descriptionsLineIdx !== 0) {
    const featuredSkillsLines = lines.slice(0, descriptionsLineIdx);
    const featuredSkillsTextItems = featuredSkillsLines
      .flat()
      .filter((item) => item.text.trim())
      .slice(0, 6);
    for (let i = 0; i < featuredSkillsTextItems.length; i++) {
      featuredSkills[i].skill = featuredSkillsTextItems[i].text;
    }
  }

  const skills: ResumeSkills = {
    featuredSkills,
    descriptions,
  };

  return { skills };
};
