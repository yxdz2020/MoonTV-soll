// 此文件由 scripts/convert-changelog.js 自动生成
// 请勿手动编辑

export interface ChangelogEntry {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "2.3.6",
    date: "2025-08-24",
    added: [
      // 无新增内容
    ],
    changed: [
    "优化播放优选换源"
    ],
    fixed: [
    "修复播放视频源缓存"
    ]
  },
  {
    version: "2.3.4",
    date: "2025-08-24",
    added: [
      // 无新增内容
    ],
    changed: [
      // 无变更内容
    ],
    fixed: [
    "修复管理功能不生效",
    "修复netlify无法部署",
    "修复非本地数据库初始化"
    ]
  },
  {
    version: "2.3.1",
    date: "2025-08-23",
    added: [
      // 无新增内容
    ],
    changed: [
      // 无变更内容
    ],
    fixed: [
    "修复配置文件不生效",
    "修复无config.json文件报错",
    "修复失败源不准确"
    ]
  },
  {
    version: "2.2.8",
    date: "2025-08-22",
    added: [
      // 无新增内容
    ],
    changed: [
    "转移视频源优选按钮至播放页面"
    ],
    fixed: [
    "优化播放换源",
    "优化失败源显示逻辑",
    "修复搜索路由问题"
    ]
  },
  {
    version: "2.2.1",
    date: "2025-08-22",
    added: [
    "搜索结果展示失败源"
    ],
    changed: [
    "移除无效代理Cors Anywhere"
    ],
    fixed: [
    "修复一次搜索两个请求的问题"
    ]
  },
  {
    version: "2.1.0",
    date: "2025-08-21",
    added: [
    "支持流式搜索搜索模式",
    "搜索结果展示视频源"
    ],
    changed: [
    "重新支持localstorage",
    "独立缓存播放源"
    ],
    fixed: [
    "修复视频播放缓存逻辑问题"
    ]
  },
  {
    version: "2.0.1",
    date: "2025-08-13",
    added: [
      // 无新增内容
    ],
    changed: [
    "版本检查和变更日志请求 Github"
    ],
    fixed: [
    "微调管理面板样式"
    ]
  },
  {
    version: "2.0.0",
    date: "2025-08-13",
    added: [
    "支持配置文件在线配置和编辑",
    "搜索页搜索框实时联想",
    "去除对 localstorage 模式的支持"
    ],
    changed: [
    "播放记录删除按钮改为垃圾桶图标以消除歧义"
    ],
    fixed: [
    "限制设置面板的最大长度，防止超出视口"
    ]
  },
  {
    version: "1.1.1",
    date: "2025-08-12",
    added: [
      // 无新增内容
    ],
    changed: [
    "修正 zwei 提供的 cors proxy 地址",
    "移除废弃代码"
    ],
    fixed: [
    "[运维] docker workflow release 日期使用东八区日期"
    ]
  },
  {
    version: "1.1.0",
    date: "2025-08-12",
    added: [
    "每日新番放送功能，展示每日新番放送的番剧"
    ],
    changed: [
      // 无变更内容
    ],
    fixed: [
    "修复远程 CHANGELOG 无法提取变更内容的问题"
    ]
  },
  {
    version: "1.0.5",
    date: "2025-08-12",
    added: [
      // 无新增内容
    ],
    changed: [
    "实现基于 Git 标签的自动 Release 工作流"
    ],
    fixed: [
      // 无修复内容
    ]
  },
  {
    version: "1.0.4",
    date: "2025-08-11",
    added: [
    "优化版本管理工作流，实现单点修改"
    ],
    changed: [
    "版本号现在从 CHANGELOG 自动提取，无需手动维护 VERSION.txt"
    ],
    fixed: [
      // 无修复内容
    ]
  },
  {
    version: "1.0.3",
    date: "2025-08-11",
    added: [
      // 无新增内容
    ],
    changed: [
    "升级播放器 Artplayer 至版本 5.2.5"
    ],
    fixed: [
      // 无修复内容
    ]
  },
  {
    version: "1.0.2",
    date: "2025-08-11",
    added: [
      // 无新增内容
    ],
    changed: [
    "版本号比较机制恢复为数字比较，仅当最新版本大于本地版本时才认为有更新",
    "[运维] 自动替换 version.ts 中的版本号为 VERSION.txt 中的版本号"
    ],
    fixed: [
      // 无修复内容
    ]
  },
  {
    version: "1.0.1",
    date: "2025-08-11",
    added: [
      // 无新增内容
    ],
    changed: [
      // 无变更内容
    ],
    fixed: [
    "修复版本检查功能，只要与最新版本号不一致即认为有更新"
    ]
  },
  {
    version: "1.0.0",
    date: "2025-08-10",
    added: [
    "基于 Semantic Versioning 的版本号机制",
    "版本信息面板，展示本地变更日志和远程更新日志"
    ],
    changed: [
      // 无变更内容
    ],
    fixed: [
      // 无修复内容
    ]
  }
];

export default changelog;
