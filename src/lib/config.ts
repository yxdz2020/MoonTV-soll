/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site?: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
};

// 在模块加载时根据环境决定配置来源
let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

export function refineConfig(adminConfig: AdminConfig): AdminConfig {
  try {
    fileConfig = JSON.parse(adminConfig.ConfigFile) as ConfigFileStruct;
  } catch (e) {
    fileConfig = {} as ConfigFileStruct;
  }
  // 合并文件中的源信息
  const apiSiteEntries = Object.entries(fileConfig.api_site || []);
  const sourceConfigMap = new Map(
    (adminConfig.SourceConfig || []).map((s) => [s.key, s])
  );

  apiSiteEntries.forEach(([key, site]) => {
    const existingSource = sourceConfigMap.get(key);
    if (existingSource) {
      // 如果已存在，只覆盖 name、api、detail 和 from
      existingSource.name = site.name;
      existingSource.api = site.api;
      existingSource.detail = site.detail;
      existingSource.from = 'config';
    } else {
      // 如果不存在，创建新条目
      sourceConfigMap.set(key, {
        key,
        name: site.name,
        api: site.api,
        detail: site.detail,
        from: 'config',
        disabled: false,
      });
    }
  });

  // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
  const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
  sourceConfigMap.forEach((source) => {
    if (!apiSiteKeys.has(source.key)) {
      source.from = 'custom';
    }
  });

  // 将 Map 转换回数组
  adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

  // 覆盖 CustomCategories
  const customCategories = fileConfig.custom_category || [];
  const customCategoriesMap = new Map(
    (adminConfig.CustomCategories || []).map((c) => [c.query + c.type, c])
  );

  customCategories.forEach((category) => {
    const key = category.query + category.type;
    const existedCategory = customCategoriesMap.get(key);
    if (existedCategory) {
      existedCategory.name = category.name;
      existedCategory.query = category.query;
      existedCategory.type = category.type;
      existedCategory.from = 'config';
    } else {
      customCategoriesMap.set(key, {
        name: category.name,
        type: category.type,
        query: category.query,
        from: 'config',
        disabled: false,
      });
    }
  });

  // 检查现有 CustomCategories 是否在 fileConfig.custom_category 中，如果不在则标记为 custom
  const customCategoriesKeys = new Set(
    customCategories.map((c) => c.query + c.type)
  );
  customCategoriesMap.forEach((category) => {
    if (!customCategoriesKeys.has(category.query + category.type)) {
      category.from = 'custom';
    }
  });

  // 将 Map 转换回数组
  adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

  return adminConfig;
}

async function initConfig() {
  if (cachedConfig) {
    // 自检补全配置
    cachedConfig = refineConfig(cachedConfig);
    return;
  }

  // 数据库存储，读取并补全管理员配置
  const storage = getStorage();

  try {
    // 尝试从数据库获取管理员配置
    let adminConfig: AdminConfig | null = null;
    if (storage && typeof (storage as any).getAdminConfig === 'function') {
      adminConfig = await (storage as any).getAdminConfig();
    }

    // 获取所有用户名，用于补全 Users
    let userNames: string[] = [];
    if (storage && typeof (storage as any).getAllUsers === 'function') {
      try {
        userNames = await (storage as any).getAllUsers();
      } catch (e) {
        console.error('获取用户列表失败:', e);
      }
    }

    if (adminConfig) {
      try {
        fileConfig = JSON.parse(adminConfig.ConfigFile) as ConfigFileStruct;
      } catch (e) {
        console.error('解析配置文件失败:', e);
        fileConfig = {} as ConfigFileStruct;
      }
      const apiSiteEntries = Object.entries(fileConfig.api_site || []);
      const customCategories = fileConfig.custom_category || [];

      // 补全 SourceConfig
      const sourceConfigMap = new Map(
        (adminConfig.SourceConfig || []).map((s) => [s.key, s])
      );

      apiSiteEntries.forEach(([key, site]) => {
        sourceConfigMap.set(key, {
          key,
          name: site.name,
          api: site.api,
          detail: site.detail,
          from: 'config',
          disabled: false,
        });
      });

      // 将 Map 转换回数组
      adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

      // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
      const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
      adminConfig.SourceConfig.forEach((source) => {
        if (!apiSiteKeys.has(source.key)) {
          source.from = 'custom';
        }
      });

      // 确保 CustomCategories 被初始化
      if (!adminConfig.CustomCategories) {
        adminConfig.CustomCategories = [];
      }

      // 补全 CustomCategories
      const customCategoriesMap = new Map(
        adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
      );

      customCategories.forEach((category) => {
        customCategoriesMap.set(category.query + category.type, {
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        });
      });

      // 检查现有 CustomCategories 是否在 fileConfig.custom_category 中，如果不在则标记为 custom
      const customCategoriesKeys = new Set(
        customCategories.map((c) => c.query + c.type)
      );
      customCategoriesMap.forEach((category) => {
        if (!customCategoriesKeys.has(category.query + category.type)) {
          category.from = 'custom';
        }
      });

      // 将 Map 转换回数组
      adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

      const existedUsers = new Set(
        (adminConfig.UserConfig.Users || []).map((u) => u.username)
      );
      userNames.forEach((uname) => {
        if (!existedUsers.has(uname)) {
          adminConfig!.UserConfig.Users.push({
            username: uname,
            role: 'user',
          });
        }
      });
      // 站长
      const ownerUser = process.env.USERNAME;
      if (ownerUser) {
        adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
          (u) => u.username !== ownerUser
        );
        adminConfig!.UserConfig.Users.unshift({
          username: ownerUser,
          role: 'owner',
        });
      }
    } else {
      fileConfig = {} as ConfigFileStruct;
      // 数据库中没有配置，创建新的管理员配置
      let allUsers = userNames.map((uname) => ({
        username: uname,
        role: 'user',
      }));
      const ownerUser = process.env.USERNAME;
      if (ownerUser) {
        allUsers = allUsers.filter((u) => u.username !== ownerUser);
        allUsers.unshift({
          username: ownerUser,
          role: 'owner',
        });
      }
      adminConfig = {
        ConfigFile: '',
        SiteConfig: {
          SiteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV',
          Announcement:
            process.env.ANNOUNCEMENT ||
            '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
          SearchDownstreamMaxPage:
            Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
          SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
          DoubanProxyType:
            process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct',
          DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
          DoubanImageProxyType:
            process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'direct',
          DoubanImageProxy: process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '',
          DisableYellowFilter:
            process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
        },
        UserConfig: {
          AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
          Users: allUsers as any,
        },
        SourceConfig: [],
        CustomCategories: [],
      };
    }

    // 写回数据库（更新/创建）
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    // 更新缓存
    cachedConfig = adminConfig;
  } catch (err) {
    console.error('加载管理员配置失败:', err);
  }
}

export async function getConfig(): Promise<AdminConfig> {
  if (process.env.DOCKER_ENV === 'true') {
    await initConfig();
    return cachedConfig;
  }
  // 非 docker 环境且 DB 存储，直接读 db 配置
  const storage = getStorage();
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }
  if (adminConfig) {
    // 确保 CustomCategories 被初始化
    if (!adminConfig.CustomCategories) {
      adminConfig.CustomCategories = [];
    }

    // 合并一些环境变量配置
    adminConfig.SiteConfig.SiteName =
      process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV';
    adminConfig.SiteConfig.Announcement =
      process.env.ANNOUNCEMENT ||
      '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
    adminConfig.UserConfig.AllowRegister =
      process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
    adminConfig.SiteConfig.DoubanProxyType =
      process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct';
    adminConfig.SiteConfig.DoubanProxy =
      process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';
    adminConfig.SiteConfig.DoubanImageProxyType =
      process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'direct';
    adminConfig.SiteConfig.DoubanImageProxy =
      process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '';
    adminConfig.SiteConfig.DisableYellowFilter =
      process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true';

    try {
      fileConfig = JSON.parse(adminConfig.ConfigFile) as ConfigFileStruct;
    } catch (e) {
      console.error('解析配置文件失败:', e);
      fileConfig = {} as ConfigFileStruct;
    }

    // 合并文件中的源信息
    const apiSiteEntries = Object.entries(fileConfig.api_site || []);
    const sourceConfigMap = new Map(
      (adminConfig.SourceConfig || []).map((s) => [s.key, s])
    );

    apiSiteEntries.forEach(([key, site]) => {
      const existingSource = sourceConfigMap.get(key);
      if (existingSource) {
        // 如果已存在，只覆盖 name、api、detail 和 from
        existingSource.name = site.name;
        existingSource.api = site.api;
        existingSource.detail = site.detail;
        existingSource.from = 'config';
      } else {
        // 如果不存在，创建新条目
        sourceConfigMap.set(key, {
          key,
          name: site.name,
          api: site.api,
          detail: site.detail,
          from: 'config',
          disabled: false,
        });
      }
    });

    // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
    const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
    sourceConfigMap.forEach((source) => {
      if (!apiSiteKeys.has(source.key)) {
        source.from = 'custom';
      }
    });

    // 将 Map 转换回数组
    adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

    // 覆盖 CustomCategories
    const customCategories = fileConfig.custom_category || [];
    adminConfig.CustomCategories = customCategories.map((category) => ({
      name: category.name,
      type: category.type,
      query: category.query,
      from: 'config',
      disabled: false,
    }));

    const ownerUser = process.env.USERNAME || '';
    // 检查配置中的站长用户是否和 USERNAME 匹配，如果不匹配则降级为普通用户
    let containOwner = false;
    adminConfig.UserConfig.Users.forEach((user) => {
      if (user.username !== ownerUser && user.role === 'owner') {
        user.role = 'user';
      }
      if (user.username === ownerUser) {
        containOwner = true;
        user.role = 'owner';
      }
    });

    // 如果不在则添加
    if (!containOwner) {
      adminConfig.UserConfig.Users.unshift({
        username: ownerUser,
        role: 'owner',
      });
    }
    cachedConfig = adminConfig;
  } else {
    // DB 无配置，执行一次初始化
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  let originConfig: AdminConfig | null = null;
  const storage = getStorage();
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    originConfig = await (storage as any).getAdminConfig();
  }

  if (originConfig) {
    fileConfig = JSON.parse(originConfig.ConfigFile) as ConfigFileStruct;
  } else {
    fileConfig = {} as ConfigFileStruct;
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  // 获取所有用户名，用于补全 Users
  let userNames: string[] = [];
  if (storage && typeof (storage as any).getAllUsers === 'function') {
    try {
      userNames = await (storage as any).getAllUsers();
    } catch (e) {
      console.error('获取用户列表失败:', e);
    }
  }

  const apiSiteEntries = Object.entries(fileConfig.api_site || []);
  const customCategories = fileConfig.custom_category || [];
  let allUsers = userNames.map((uname) => ({
    username: uname,
    role: 'user',
  }));
  const ownerUser = process.env.USERNAME;
  if (ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== ownerUser);
    allUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }
  const adminConfig = {
    ConfigFile: originConfig?.ConfigFile || '',
    SiteConfig: {
      SiteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      DoubanProxyType: process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      DoubanImageProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'direct',
      DoubanImageProxy: process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '',
      DisableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: allUsers as any,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
    CustomCategories:
      storageType === 'redis'
        ? customCategories?.map((category) => ({
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        })) || []
        : [],
  } as AdminConfig;

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }
  if (cachedConfig == null) {
    // serverless 环境，直接使用 adminConfig
    cachedConfig = adminConfig;
  }
  cachedConfig.ConfigFile = adminConfig.ConfigFile;
  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.SourceConfig = adminConfig.SourceConfig;
  cachedConfig.CustomCategories = adminConfig.CustomCategories || [];
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  return config.SourceConfig.filter((s) => !s.disabled).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
    detail: s.detail,
  }));
}
