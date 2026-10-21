import type { AgentRole } from './agent-roles.ts';

type DesignSkill = { id:string; title:string; appliesTo:AgentRole[]; guidance:string };

/** Small, reviewable design skills. Only relevant skills are added to each agent request. */
export const designSkills:DesignSkill[] = [
 {id:'layout',title:'Layout and composition',appliesTo:['creative_director','ux_architect','ui_designer'],guidance:'Build a clear hierarchy with a consistent spacing scale. Start with a full mobile Screen Frame root container (375px width, at least 812px tall). Fill only the active screen with a continuous flow rather than isolated cards. Never create or edit a second screen in the same generation loop. Build this screen as nested flex containers connected by parentId. Use column flow for sections and row flow for related controls. Set layoutMode, padding, itemSpacing, properties.alignItems and properties.justifyContent. Spacing and borderRadius use multiples of 8. Set primaryAxisSizingMode and counterAxisSizingMode to FILL, HUG or catalog FIXED; never output coordinates. Do not place instructional annotations on top of the product UI. Preserve room for content to grow.'},
 {id:'typography',title:'Typography and content fit',appliesTo:['copywriter','ux_architect','ui_designer','qa_critic'],guidance:'Write concise interface copy. Always use HUG for text height (primary axis for VERTICAL leaf nodes). Let the browser measure and wrap text; never estimate its pixel dimensions. Allow realistic wrapping and readable line lengths. Keep text inside its parent hierarchy and use browser wrapping. Use text alignment deliberately: left for body copy, centered only where the composition calls for it.'},
 {id:'imagery',title:'Imagery and visual assets',appliesTo:['creative_director','ui_designer'],guidance:'Use uploaded assets or invoke search_unsplash with specific visual queries. Use only stable CDN imageUrl values returned by the connector; the backend retains attribution and records selection. Never invent asset IDs, photo IDs or image URLs. Use icon layers for simple interface symbols, choosing properties.iconName from the provided semantic Lucide UI dictionary. Wrap each icon in a fixed 16px or 20px inline-flex box, alongside text in a horizontal center-aligned row with itemSpacing 8. Buttons and inputs also accept a leading iconName slot; every icon must resolve to a real catalog key. Choose cover for photographic crops and contain for logos or illustrations. Keep essential labels outside images unless contrast and placement are reliable.'},
 {id:'accessibility',title:'Accessibility review',appliesTo:['qa_critic','ux_architect','ui_designer'],guidance:'Check reading order, text contrast, readable type size, control labels and touch targets. Do not rely on color alone for status. Ensure text remains legible with increased line spacing and can be read without clipping or overlap.'},
];

export function skillsForAgent(role:AgentRole, instruction:string) {
 const relevant=designSkills.filter(skill=>skill.appliesTo.includes(role));
 const hasImage=/image|photo|picture|logo|asset|illustrat/i.test(instruction);
 return relevant.filter(skill=>skill.id!=='imagery'||hasImage||role==='ui_designer');
}

export function designSkillPrompt(role:AgentRole,instruction:string) {
 return skillsForAgent(role,instruction).map(skill=>`[${skill.title}] ${skill.guidance}`).join('\n');
}
