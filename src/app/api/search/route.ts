/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const streamParam = searchParams.get('stream');
  const enableStream = streamParam !== '0'; // 默认开启流式

  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  if (!query) {
    // 空查询，明确不缓存
    return new Response(JSON.stringify({ results: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  // 安全写入与断连处理
  let shouldStop = false;
  const abortSignal = (request as any).signal as AbortSignal | undefined;
  abortSignal?.addEventListener('abort', () => {
    shouldStop = true;
    try {
      writer.close();
    } catch {
      // ignore
    }
  });

  const safeWrite = async (obj: unknown) => {
    if (shouldStop || abortSignal?.aborted) return false;
    try {
      await writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
      return true;
    } catch {
      shouldStop = true;
      return false;
    }
  };

  if (!enableStream) {
    // 非流式：聚合完成后根据是否为空设置缓存策略
    const aggregatedResults: any[] = [];
    const failedSources: { name: string; key: string; error: string }[] = [];
    
    for (const site of apiSites) {
      try {
        const generator = searchFromApiStream(site, query);
        let hasResults = false;
        for await (const pageResults of generator) {
          let filteredResults = pageResults;
          if(filteredResults.length != 0){
            hasResults = true;
          }
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = pageResults.filter((result) => {
              const typeName = result.type_name || '';
              return !yellowWords.some((word) => typeName.includes(word));
            });
          }
          if(hasResults === true && filteredResults.length === 0){
            failedSources.push({ name: site.name, key: site.key, error: '结果被过滤' });
            break;
          }
          aggregatedResults.push(...filteredResults);
        }
        // 如果没有结果，也记录为失败
        if (!hasResults) {
          failedSources.push({ name: site.name, key: site.key, error: '无搜索结果' });
        }
      } catch (err: any) {
        console.warn(`搜索失败 ${site.name}:`, err.message);
        failedSources.push({ name: site.name, key: site.key, error: err.message || '未知的错误' });
      }
    }

    if (aggregatedResults.length === 0) {
      return new Response(JSON.stringify({ 
        aggregatedResults,
        failedSources 
      }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    } else {
      const cacheTime = await getCacheTime();
      return new Response(JSON.stringify({ 
        aggregatedResults,
        failedSources 
      }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      });
    }
  }

  // 流式：保持原有流式行为（无法在响应开始后再按"是否为空"调整缓存头）

  (async () => {
    const aggregatedResults: any[] = [];
    const failedSources: { name: string; key: string; error: string }[] = [];
    
    for (const site of apiSites) {
      try {
        const generator = searchFromApiStream(site, query);
        let hasResults = false;
        for await (const pageResults of generator) {
          let filteredResults = pageResults;
          if(filteredResults.length != 0){
            hasResults = true;
          }
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = pageResults.filter((result) => {
              const typeName = result.type_name || '';
              return !yellowWords.some((word) => typeName.includes(word));
            });
          }
          if(hasResults === true && filteredResults.length === 0){
            failedSources.push({ name: site.name, key: site.key, error: '结果被过滤' });
            await safeWrite({ failedSources });
            break;
          }
          aggregatedResults.push(...filteredResults);
          if (!(await safeWrite({ pageResults: filteredResults }))) {
            break;
          }
        }
        // 如果没有结果，也记录为失败
        if (!hasResults) {
          failedSources.push({ name: site.name, key: site.key, error: '无搜索结果' });
          // 发送失败的数据源信息
          await safeWrite({ failedSources });
        }
      } catch (err: any) {
        console.warn(`搜索失败 ${site.name}:`, err.message);
        failedSources.push({ name: site.name, key: site.key, error: err.message || '未知的错误' });
        await safeWrite({ failedSources });
      }

      if (shouldStop) break;
    }
    
    // 发送失败的数据源信息
    if (failedSources.length > 0) {
      await safeWrite({ failedSources });
    }
    
    await safeWrite({ aggregatedResults });
    try {
      await writer.close();
    } catch {
      // ignore
    }
  })();

  const cacheTime = await getCacheTime();
  return new Response(readable, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `private, max-age=${cacheTime}`,
    },
  });
}
