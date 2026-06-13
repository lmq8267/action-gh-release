import { setFailed, setOutput } from '@actions/core';
import { getOctokit } from '@actions/github';
import { GitHubReleaser, release, finalizeRelease, upload, listReleaseAssets } from './github';
import { isTag, parseConfig, paths, unmatchedPatterns, uploadUrl } from './util';

import { env } from 'process';

async function run() {
  try {
    const config = parseConfig(env);
    if (!config.input_tag_name && !isTag(config.github_ref) && !config.input_draft) {
      throw new Error(`⚠️ GitHub Releases 需要一个标签（tag）`);
    }
    if (config.input_files) {
      const patterns = unmatchedPatterns(config.input_files, config.input_working_directory);
      patterns.forEach((pattern) => {
        if (config.input_fail_on_unmatched_files) {
          throw new Error(`⚠️ 模式 '${pattern}' 没有匹配到任何文件。`);
        } else {
          console.warn(`🤔 模式 '${pattern}' 没有匹配到任何文件。`);
        }
      });
      if (patterns.length > 0 && config.input_fail_on_unmatched_files) {
        throw new Error(`⚠️ 存在未匹配的文件`);
      }
    }

    // const oktokit = GitHub.plugin(
    //   require("@octokit/plugin-throttling"),
    //   require("@octokit/plugin-retry")
    // );

    const gh = getOctokit(config.github_token, {
      //new oktokit(
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.warn(`请求配额已耗尽，来自请求 ${options.method} ${options.url}`);
          if (options.request.retryCount === 0) {
            // 仅重试一次
            console.log(`将在 ${retryAfter} 秒后重试！`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // 不重试，仅记录警告
          console.warn(`检测到滥用行为，来自请求 ${options.method} ${options.url}`);
        },
      },
    });
    //);
    const releaser = new GitHubReleaser(gh);
    const releaseResult = await release(config, releaser);
    let rel = releaseResult.release;
    const releaseWasCreated = releaseResult.created;
    let uploadedAssetIds: Set<number> = new Set();
    if (config.input_files && config.input_files.length > 0) {
      const files = paths(config.input_files, config.input_working_directory);
      if (files.length == 0) {
        if (config.input_fail_on_unmatched_files) {
          throw new Error(`⚠️ ${config.input_files} 不包含有效文件。`);
        } else {
          console.warn(`🤔 ${config.input_files} 不包含有效文件。`);
        }
      }
      const currentAssets = rel.assets;

      const uploadFile = async (path: string) => {
        const json = await upload(config, releaser, uploadUrl(rel.upload_url), path, currentAssets);
        return json ? (json.id as number) : undefined;
      };

      let results: (number | undefined)[];
      if (!config.input_preserve_order) {
        results = await Promise.all(files.map(uploadFile));
      } else {
        results = [];
        for (const path of files) {
          results.push(await uploadFile(path));
        }
      }

      uploadedAssetIds = new Set(results.filter((id): id is number => id !== undefined));
    }

    console.log('正在完成发布...');
    rel = await finalizeRelease(config, releaser, rel, releaseWasCreated);

    // 草稿发布使用临时的 "untagged-..." URL 来引用资产。
    // 发布上线后，这些 URL 会被替换为正确的地址。
    console.log('正在获取资产列表...');
    {
      let assets: any[] = [];
      if (uploadedAssetIds.size > 0) {
        const updatedAssets = await listReleaseAssets(config, releaser, rel);
        assets = updatedAssets
          .filter((a) => uploadedAssetIds.has(a.id))
          .map((a) => {
            const { uploader, ...rest } = a;
            return rest;
          });
      }
      setOutput('assets', assets);
    }

    console.log(`🎉 Release 已就绪，访问地址 ${rel.html_url}`);
    setOutput('url', rel.html_url);
    setOutput('id', rel.id.toString());
    setOutput('upload_url', rel.upload_url);
  } catch (error) {
    setFailed(error.message);
  }
}

run();
