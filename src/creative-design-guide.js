// Shared purpose vocabulary; composition lives in creative-page-brief.js.
export const structureReferenceGuide='可以参考主图与旁注、错层图文、分栏收藏或留白封面等不同阅读结构；根据本次真实素材和用途自由选择，不复制固定坐标。';
const purposeMethods={
  自由创作:'让素材与想表达的态度共同决定图文关系，不要求标准日记结构。',
  清单计划:'写可执行条目、愿望或问题，未提供日程时保持为设想，不标成已经完成。',
  主题封面:'主题与主视觉互相回应，副题按需，不强塞段落。'
};
export const purposeMethod=name=>purposeMethods[name]||purposeMethods.自由创作;
