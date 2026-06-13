import { GitHub } from '@actions/github/lib/utils';
import { statSync } from 'fs';
import { open } from 'fs/promises';
import { lookup } from 'mime-types';
import { basename } from 'path';
import { randomInt } from 'crypto';
import { alignAssetName, Config, isTag, normalizeTagName, releaseBody } from './util';

type GitHub = InstanceType<typeof GitHub>;

export interface ReleaseAsset {
  name: string;
  mime: string;
  size: number;
}

export interface Release {
  id: number;
  upload_url: string;
  html_url: string;
  tag_name: string;
  name: string | null;
  body?: string | null | undefined;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ id: number; name: string; label?: string | null }>;
}

export interface ReleaseResult {
  release: Release;
  created: boolean;
}

type ReleaseNotesParams = {
  owner: string;
  repo: string;
  tag_name: string;
  target_commitish: string | undefined;
  previous_tag_name?: string;
};

type ReleaseMutationParams = {
  owner: string;
  repo: string;
  tag_name: string;
  name: string;
  body: string | undefined;
  draft: boolean | undefined;
  prerelease: boolean | undefined;
  target_commitish: string | undefined;
  discussion_category_name: string | undefined;
  generate_release_notes: boolean | undefined;
  make_latest: 'true' | 'false' | 'legacy' | undefined;
  previous_tag_name?: string;
};

export interface Releaser {
  getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }>;

  createRelease(params: ReleaseMutationParams): Promise<{ data: Release }>;

  updateRelease(
    params: ReleaseMutationParams & {
      release_id: number;
      target_commitish: string;
    },
  ): Promise<{ data: Release }>;

  finalizeRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
    discussion_category_name: string | undefined;
  }): Promise<{ data: Release }>;

  allReleases(params: { owner: string; repo: string }): AsyncIterable<{ data: Release[] }>;

  listReleaseAssets(params: {
    owner: string;
    repo: string;
    release_id: number;
  }): Promise<Array<{ id: number; name: string; label?: string | null; [key: string]: any }>>;

  deleteReleaseAsset(params: { owner: string; repo: string; asset_id: number }): Promise<void>;

  deleteRelease(params: { owner: string; repo: string; release_id: number }): Promise<void>;

  updateReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
    name: string;
    label: string;
  }): Promise<{ data: any }>;

  uploadReleaseAsset(params: {
    url: string;
    size: number;
    mime: string;
    token: string;
    data: any;
  }): Promise<{ status: number; data: any }>;
}

export class GitHubReleaser implements Releaser {
  github: GitHub;
  constructor(github: GitHub) {
    this.github = github;
  }

  getReleaseByTag(params: {
    owner: string;
    repo: string;
    tag: string;
  }): Promise<{ data: Release }> {
    return this.github.rest.repos.getReleaseByTag(params);
  }

  async getReleaseNotes(params: ReleaseNotesParams): Promise<{
    data: {
      name: string;
      body: string;
    };
  }> {
    return await this.github.rest.repos.generateReleaseNotes(params);
  }

  private async prepareReleaseMutation<T extends ReleaseMutationParams>(
    params: T,
  ): Promise<Omit<T, 'previous_tag_name'>> {
    const { previous_tag_name, ...releaseParams } = params;

    if (
      typeof releaseParams.make_latest === 'string' &&
      !['true', 'false', 'legacy'].includes(releaseParams.make_latest)
    ) {
      releaseParams.make_latest = undefined;
    }
    if (releaseParams.generate_release_notes) {
      const releaseNotes = await this.getReleaseNotes({
        owner: releaseParams.owner,
        repo: releaseParams.repo,
        tag_name: releaseParams.tag_name,
        target_commitish: releaseParams.target_commitish,
        previous_tag_name,
      });
      releaseParams.generate_release_notes = false;
      if (releaseParams.body) {
        releaseParams.body = `${releaseParams.body}\n\n${releaseNotes.data.body}`;
      } else {
        releaseParams.body = releaseNotes.data.body;
      }
    }
    releaseParams.body = releaseParams.body
      ? this.truncateReleaseNotes(releaseParams.body)
      : undefined;
    return releaseParams;
  }

  truncateReleaseNotes(input: string): string {
    // release notes can be a maximum of 125000 characters
    const githubNotesMaxCharLength = 125000;
    return input.substring(0, githubNotesMaxCharLength - 1);
  }

  async createRelease(params: ReleaseMutationParams): Promise<{ data: Release }> {
    return this.github.rest.repos.createRelease(await this.prepareReleaseMutation(params));
  }

  async updateRelease(
    params: ReleaseMutationParams & {
      release_id: number;
      target_commitish: string;
    },
  ): Promise<{ data: Release }> {
    return this.github.rest.repos.updateRelease(await this.prepareReleaseMutation(params));
  }

  async finalizeRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
    discussion_category_name: string | undefined;
  }) {
    return await this.github.rest.repos.updateRelease({
      owner: params.owner,
      repo: params.repo,
      release_id: params.release_id,
      draft: false,
      make_latest: params.make_latest,
      discussion_category_name: params.discussion_category_name,
    });
  }

  allReleases(params: { owner: string; repo: string }): AsyncIterable<{ data: Release[] }> {
    const updatedParams = { per_page: 100, ...params };
    return this.github.paginate.iterator(
      this.github.rest.repos.listReleases.endpoint.merge(updatedParams),
    );
  }

  async listReleaseAssets(params: {
    owner: string;
    repo: string;
    release_id: number;
  }): Promise<Array<{ id: number; name: string; label?: string | null; [key: string]: any }>> {
    return this.github.paginate(this.github.rest.repos.listReleaseAssets, {
      ...params,
      per_page: 100,
    });
  }

  async deleteReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
  }): Promise<void> {
    await this.github.rest.repos.deleteReleaseAsset(params);
  }

  async deleteRelease(params: { owner: string; repo: string; release_id: number }): Promise<void> {
    await this.github.rest.repos.deleteRelease(params);
  }

  async updateReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
    name: string;
    label: string;
  }): Promise<{ data: any }> {
    return await this.github.rest.repos.updateReleaseAsset(params);
  }

  async uploadReleaseAsset(params: {
    url: string;
    size: number;
    mime: string;
    token: string;
    data: any;
  }): Promise<{ status: number; data: any }> {
    return this.github.request({
      method: 'POST',
      url: params.url,
      headers: {
        'content-length': `${params.size}`,
        'content-type': params.mime,
        authorization: `token ${params.token}`,
      },
      data: params.data,
    });
  }
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
  };
};

export const mimeOrDefault = (path: string): string => {
  return lookup(path) || 'application/octet-stream';
};

const releaseAssetMatchesName = (
  name: string,
  asset: { name: string; label?: string | null },
): boolean => asset.name === name || asset.name === alignAssetName(name) || asset.label === name;

const isReleaseAssetUpdateNotFound = (error: any): boolean => {
  const errorStatus = error?.status ?? error?.response?.status;
  const requestUrl = error?.request?.url;
  const errorMessage = error?.message;
  const isReleaseAssetRequest =
    typeof requestUrl === 'string' &&
    (/\/releases\/assets\//.test(requestUrl) || /\/releases\/\d+\/assets(?:\?|$)/.test(requestUrl));

  return (
    errorStatus === 404 &&
    (isReleaseAssetRequest ||
      (typeof errorMessage === 'string' && errorMessage.includes('update-a-release-asset')))
  );
};

const isImmutableReleaseAssetUploadFailure = (error: any): boolean => {
  const errorStatus = error?.status ?? error?.response?.status;
  const errorMessage = error?.response?.data?.message ?? error?.message;

  return errorStatus === 422 && /immutable release/i.test(String(errorMessage));
};

const immutableReleaseAssetUploadMessage = (
  name: string,
  prerelease: boolean | undefined,
): string =>
  prerelease
    ? `无法将资产 ${name} 上传到不可变的 Release。GitHub 只允许在 Release 发布之前上传资产，但草稿预发布使用 release.published 事件而非 release.prereleased 事件触发。如果需要在不可变 Release 仓库中为预发布上传资产，请使用 draft: true 保持草稿状态，然后稍后从该草稿发布并让下游工作流订阅 release.published。`
    : `无法将资产 ${name} 上传到不可变的 Release。GitHub 只允许在 Release 发布之前上传资产，因此请先将资产上传到草稿 Release，然后再发布它。`;

export const upload = async (
  config: Config,
  releaser: Releaser,
  url: string,
  path: string,
  currentAssets: Array<{ id: number; name: string; label?: string | null }>,
): Promise<any> => {
  const [owner, repo] = config.github_repository.split('/');
  const { name, mime, size } = asset(path);
  const releaseIdMatch = url.match(/\/releases\/(\d+)\/assets/);
  const releaseId = releaseIdMatch ? Number(releaseIdMatch[1]) : undefined;
  const currentAsset = currentAssets.find(
    // GitHub can rewrite uploaded asset names, so compare against both the raw name
    // GitHub returns and the restored label we set when available.
    (currentAsset) => releaseAssetMatchesName(name, currentAsset),
  );
  if (currentAsset) {
    if (config.input_overwrite_files === false) {
      console.log(`资产 ${name} 已存在且 overwrite_files 为 false，跳过...`);
      return null;
    } else {
      console.log(`♻️ 正在删除之前上传的资产 ${name}...`);
      await releaser.deleteReleaseAsset({
        asset_id: currentAsset.id || 1,
        owner,
        repo,
      });
    }
  }
  console.log(`⬆️ 正在上传 ${name}...`);
  const endpoint = new URL(url);
  endpoint.searchParams.append('name', name);
  const findReleaseAsset = async (
    matches: (asset: { id: number; name: string; label?: string | null }) => boolean,
    attempts: number = 3,
  ) => {
    if (releaseId === undefined) {
      return undefined;
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const latestAssets = await releaser.listReleaseAssets({
        owner,
        repo,
        release_id: releaseId,
      });
      const latestAsset = latestAssets.find(matches);
      if (latestAsset) {
        return latestAsset;
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return undefined;
  };
  const uploadAsset = async () => {
    const fh = await open(path);
    try {
      return await releaser.uploadReleaseAsset({
        url: endpoint.toString(),
        size,
        mime,
        token: config.github_token,
        data: fh.readableWebStream(),
      });
    } finally {
      await fh.close();
    }
  };

  const maybeRestoreAssetLabel = async (uploadedAsset: {
    id?: number;
    name?: string;
    label?: string | null;
    [key: string]: any;
  }) => {
    if (!uploadedAsset.name || uploadedAsset.name === name || !uploadedAsset.id) {
      return uploadedAsset;
    }

    console.log(`✏️ 正在将资产标签恢复为 ${name}...`);

    const updateAssetLabel = async (assetId: number) => {
      const { data } = await releaser.updateReleaseAsset({
        owner,
        repo,
        asset_id: assetId,
        name: uploadedAsset.name!,
        label: name,
      });
      return data;
    };

    try {
      return await updateAssetLabel(uploadedAsset.id);
    } catch (error: any) {
      const errorStatus = error?.status ?? error?.response?.status;

      if (errorStatus === 404 && releaseId !== undefined) {
        try {
          const latestAsset = await findReleaseAsset(
            (currentAsset) =>
              currentAsset.id === uploadedAsset.id || currentAsset.name === uploadedAsset.name,
          );
          if (latestAsset) {
            return await updateAssetLabel(latestAsset.id);
          }
        } catch (refreshError) {
          console.warn(`刷新资产 ${name} 的 Release 资产时出错：${refreshError}`);
        }
      }

      console.warn(`更新资产 ${name} 的标签时出错：${error}`);
      return uploadedAsset;
    }
  };

  const handleUploadedAsset = async (resp: { status: number; data: any }) => {
    const json = resp.data;
    if (resp.status !== 201) {
      throw new Error(
        `上传 Release 资产 ${name} 失败。收到状态码 ${
          resp.status
        }\n${json.message}\n${JSON.stringify(json.errors)}`,
      );
    }
    const assetWithLabel = await maybeRestoreAssetLabel(json);
    console.log(`✅ ${name} 上传成功`);
    return assetWithLabel;
  };

  try {
    return await handleUploadedAsset(await uploadAsset());
  } catch (error: any) {
    const errorStatus = error?.status ?? error?.response?.status;
    const errorData = error?.response?.data;

    if (isImmutableReleaseAssetUploadFailure(error)) {
      throw new Error(immutableReleaseAssetUploadMessage(name, config.input_prerelease));
    }

    if (releaseId !== undefined && isReleaseAssetUpdateNotFound(error)) {
      try {
        const latestAsset = await findReleaseAsset((currentAsset) =>
          releaseAssetMatchesName(name, currentAsset),
        );
        if (latestAsset) {
          console.warn(
            `更新资产 ${name} 的 Release 资产元数据时出错：${error}。刷新后找到匹配的资产，继续执行...`,
          );
          return latestAsset;
        }
      } catch (refreshError) {
        console.warn(
          `元数据更新失败后刷新 Release 资产时出错：${refreshError}`,
        );
      }
    }

    // Handle race conditions across concurrent workflows uploading the same asset.
    if (
      config.input_overwrite_files !== false &&
      errorStatus === 422 &&
      errorData?.errors?.[0]?.code === 'already_exists' &&
      releaseId !== undefined
    ) {
      console.log(
        `⚠️ 资产 ${name} 已存在（竞态条件），正在刷新资产列表并重试一次...`,
      );
      const latestAssets = await releaser.listReleaseAssets({
        owner,
        repo,
        release_id: releaseId,
      });
      const latestAsset = latestAssets.find((currentAsset) =>
        releaseAssetMatchesName(name, currentAsset),
      );
      if (latestAsset) {
        await releaser.deleteReleaseAsset({
          owner,
          repo,
          asset_id: latestAsset.id,
        });
        return await handleUploadedAsset(await uploadAsset());
      }
    }

    throw error;
  }
};

export const release = async (
  config: Config,
  releaser: Releaser,
  maxRetries: number = 3,
): Promise<ReleaseResult> => {
  if (maxRetries <= 0) {
    console.log(`❌ 重试次数过多，正在中止...`);
    throw new Error('重试次数过多。');
  }

  const [owner, repo] = config.github_repository.split('/');
  const tag =
    normalizeTagName(config.input_tag_name) ||
    (isTag(config.github_ref) ? config.github_ref.replace('refs/tags/', '') : '');

  const discussion_category_name = config.input_discussion_category_name;
  const generate_release_notes = config.input_generate_release_notes;
  const previous_tag_name = config.input_previous_tag;

  if (generate_release_notes && previous_tag_name) {
    console.log(`📝 使用上一个标签 ${previous_tag_name} 生成 Release 说明`);
  }
  try {
    const _release: Release | undefined = await findTagFromReleases(releaser, owner, repo, tag);

    if (_release === undefined) {
      return await createRelease(
        tag,
        config,
        releaser,
        owner,
        repo,
        discussion_category_name,
        generate_release_notes,
        maxRetries,
        previous_tag_name,
      );
    }

    let existingRelease: Release = _release!;
    console.log(`找到 Release ${existingRelease.name}（ID=${existingRelease.id}）`);

    const release_id = existingRelease.id;
    let target_commitish: string;
    if (
      config.input_target_commitish &&
      config.input_target_commitish !== existingRelease.target_commitish
    ) {
      console.log(
        `正在将 commit 从 "${existingRelease.target_commitish}" 更新为 "${config.input_target_commitish}"`,
      );
      target_commitish = config.input_target_commitish;
    } else {
      target_commitish = existingRelease.target_commitish;
    }

    const tag_name = tag;
    const name = config.input_name || existingRelease.name || tag;
    // revisit: support a new body-concat-strategy input for accumulating
    // body parts as a release gets updated. some users will likely want this while
    // others won't previously this was duplicating content for most which
    // no one wants
    const workflowBody = releaseBody(config) || '';
    const existingReleaseBody = existingRelease.body || '';
    let body: string;
    if (config.input_append_body && workflowBody && existingReleaseBody) {
      body = existingReleaseBody + '\n' + workflowBody;
    } else {
      body = workflowBody || existingReleaseBody;
    }

    const prerelease =
      config.input_prerelease !== undefined ? config.input_prerelease : existingRelease.prerelease;

    const make_latest = config.input_make_latest;

    // 更新 Release 时，如果标签没变就不传 tag_name，避免触发 GitHub API
    // 的唯一性校验（422 already_exists），详见 https://docs.github.com/rest/releases/releases#update-a-release
    const release = await releaser.updateRelease({
      owner,
      repo,
      release_id,
      ...(tag_name !== existingRelease.tag_name ? { tag_name } : {}),
      target_commitish,
      name,
      body,
      draft: existingRelease.draft,
      prerelease,
      discussion_category_name,
      generate_release_notes,
      make_latest,
    } as ReleaseMutationParams & {
      release_id: number;
      target_commitish: string;
    });
    return {
      release: release.data,
      created: false,
    };
  } catch (error) {
    if (error.status !== 404) {
      // 处理矩阵构建中的竞态条件：两个 Job 同时更新同一个 Release
      if (error.status === 422 && error.response?.data?.errors?.[0]?.code === 'already_exists') {
        console.log(
          `⚠️ Release 更新时检测到竞态条件（already_exists），正在重试...（剩余 ${maxRetries - 1} 次重试机会）`,
        );
        // 随机延迟 1~3 秒，错开多个矩阵 Job 的重试时间，避免持续冲突
        await sleep(UPDATE_RACE_RETRY_DELAY_MS + randomInt(1000));
        return release(config, releaser, maxRetries - 1);
      }

      console.log(
        `⚠️ 获取标签 ${config.github_ref} 的 GitHub Release 时出现意外错误：${error}`,
      );
      throw error;
    }

    return await createRelease(
      tag,
      config,
      releaser,
      owner,
      repo,
      discussion_category_name,
      generate_release_notes,
      maxRetries,
      previous_tag_name,
    );
  }
};

/**
 * Finalizes a release by unmarking it as "draft" (if relevant)
 * after all artifacts have been uploaded.
 *
 * @param config - Release configuration as specified by user
 * @param releaser - The GitHub API wrapper for release operations
 * @param release - The existing release to be finalized
 * @param maxRetries - The maximum number of attempts to finalize the release
 */
export const finalizeRelease = async (
  config: Config,
  releaser: Releaser,
  release: Release,
  releaseWasCreated: boolean = false,
  maxRetries: number = 3,
): Promise<Release> => {
  if (config.input_draft === true || release.draft === false) {
    return release;
  }

  if (maxRetries <= 0) {
    console.log(`❌ 重试次数过多，正在中止...`);
    throw new Error('重试次数过多。');
  }

  const [owner, repo] = config.github_repository.split('/');
  try {
    const { data } = await releaser.finalizeRelease({
      owner,
      repo,
      release_id: release.id,
      make_latest: config.input_make_latest,
      discussion_category_name: config.input_discussion_category_name,
    });

    return data;
  } catch (error) {
    console.warn(`完成 Release 时出错：${error}`);

    if (releaseWasCreated && release.draft && isTagCreationBlockedError(error)) {
      let deleted = false;

      try {
        console.log(
          `🧹 正在删除标签 ${release.tag_name} 的草稿 Release ${release.id}，因为标签创建被仓库规则阻止...`,
        );
        await releaser.deleteRelease({
          owner,
          repo,
          release_id: release.id,
        });
        deleted = true;
      } catch (cleanupError) {
        console.warn(`删除孤立草稿 Release ${release.id} 时出错：${cleanupError}`);
      }

      const cleanupResult = deleted
        ? `已删除草稿 Release ${release.id} 以避免留下孤立的草稿 Release。`
        : `无法删除草稿 Release ${release.id}；可能需要手动清理。`;
      throw new Error(
        `标签 ${release.tag_name} 的创建被仓库规则阻止。${cleanupResult}`,
      );
    }

    console.log(`正在重试...（剩余 ${maxRetries - 1} 次重试机会）`);
    return finalizeRelease(config, releaser, release, releaseWasCreated, maxRetries - 1);
  }
};

/**
 * Lists assets belonging to a release.
 *
 * @param config - Release configuration as specified by user
 * @param releaser - The GitHub API wrapper for release operations
 * @param release - The existing release to be checked
 * @param maxRetries - The maximum number of attempts
 */
export const listReleaseAssets = async (
  config: Config,
  releaser: Releaser,
  release: Release,
  maxRetries: number = 3,
): Promise<Array<{ id: number; name: string; [key: string]: any }>> => {
  if (maxRetries <= 0) {
    console.log(`❌ 重试次数过多，正在中止...`);
    throw new Error('重试次数过多。');
  }

  const [owner, repo] = config.github_repository.split('/');
  try {
    const assets = await releaser.listReleaseAssets({
      owner,
      repo,
      release_id: release.id,
    });

    return assets;
  } catch (error) {
    console.warn(`列出 Release 资产时出错：${error}`);
    console.log(`正在重试...（剩余 ${maxRetries - 1} 次重试机会）`);
    return listReleaseAssets(config, releaser, release, maxRetries - 1);
  }
};

/**
 * Finds a release by tag name.
 *
 * Uses the direct getReleaseByTag API for O(1) lookup instead of iterating
 * through all releases. This also avoids GitHub's API pagination limit of
 * 10000 results which would cause failures for repositories with many releases.
 *
 * @param releaser - The GitHub API wrapper for release operations
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param tag - The tag name to search for
 * @returns The release with the given tag name, or undefined if no release with that tag name is found
 */
export async function findTagFromReleases(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
): Promise<Release | undefined> {
  try {
    const { data: release } = await releaser.getReleaseByTag({ owner, repo, tag });
    return release;
  } catch (error) {
    // Release not found (404) or other error - return undefined to allow creation
    if (error.status === 404) {
      return undefined;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

const CREATED_RELEASE_DISCOVERY_RETRY_DELAY_MS = 1000;
const UPDATE_RACE_RETRY_DELAY_MS = 2000;
const RECENT_RELEASE_SCAN_PAGES = 2;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function recentReleasesByTag(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
): Promise<Release[]> {
  const matches: Release[] = [];
  let pages = 0;

  for await (const page of releaser.allReleases({ owner, repo })) {
    matches.push(...page.data.filter((release) => release.tag_name === tag));
    pages += 1;

    if (pages >= RECENT_RELEASE_SCAN_PAGES) {
      break;
    }
  }

  return matches;
}

function pickCanonicalRelease(
  releases: Release[],
  releaseByTag: Release | undefined,
): Release | undefined {
  if (releaseByTag && releases.some((release) => release.id === releaseByTag.id)) {
    return releaseByTag;
  }

  if (releases.length === 0) {
    return releaseByTag;
  }

  return [...releases].sort((left, right) => {
    if (left.draft !== right.draft) {
      return Number(left.draft) - Number(right.draft);
    }

    return left.id - right.id;
  })[0];
}

async function cleanupDuplicateDraftReleases(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
  canonicalReleaseId: number,
  releases: Release[],
): Promise<void> {
  const uniqueReleases = Array.from(
    new Map(releases.map((release) => [release.id, release])).values(),
  );

  for (const duplicate of uniqueReleases) {
    if (duplicate.id === canonicalReleaseId || !duplicate.draft || duplicate.assets.length > 0) {
      continue;
    }

    try {
      console.log(`🧹 正在删除标签 ${tag} 的重复草稿 Release ${duplicate.id}...`);
      await releaser.deleteRelease({
        owner,
        repo,
        release_id: duplicate.id,
      });
    } catch (error) {
      console.warn(`删除重复 Release ${duplicate.id} 时出错：${error}`);
    }
  }
}

async function canonicalizeCreatedRelease(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
  createdRelease: Release,
  maxRetries: number,
): Promise<Release> {
  const attempts = Math.max(maxRetries, 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let releaseByTag: Release | undefined;
    try {
      releaseByTag = await findTagFromReleases(releaser, owner, repo, tag);
    } catch (error) {
      console.warn(`重新加载标签 ${tag} 的 Release 时出错：${error}`);
    }

    let recentReleases: Release[] = [];
    try {
      recentReleases = await recentReleasesByTag(releaser, owner, repo, tag);
    } catch (error) {
      console.warn(`列出标签 ${tag} 的最近 Release 时出错：${error}`);
    }

    const canonicalRelease = pickCanonicalRelease(recentReleases, releaseByTag);
    if (canonicalRelease) {
      if (canonicalRelease.id !== createdRelease.id) {
        console.log(
          `↪️ 标签 ${tag} 使用 Release ${canonicalRelease.id} 而非重复的草稿 ${createdRelease.id}`,
        );
      }

      await cleanupDuplicateDraftReleases(releaser, owner, repo, tag, canonicalRelease.id, [
        createdRelease,
        ...recentReleases,
      ]);
      return canonicalRelease;
    }

    if (attempt < attempts) {
      console.log(
        `Release ${createdRelease.id} 尚无法通过标签 ${tag} 查找到，正在重试...（剩余 ${
          attempts - attempt
        } 次重试机会）`,
      );
      await sleep(CREATED_RELEASE_DISCOVERY_RETRY_DELAY_MS);
    }
  }

  console.log(
    `⚠️ 继续使用新创建的 Release ${createdRelease.id}，因为标签 ${tag} 仍然无法查找到`,
  );
  return createdRelease;
}

async function createRelease(
  tag: string,
  config: Config,
  releaser: Releaser,
  owner: string,
  repo: string,
  discussion_category_name: string | undefined,
  generate_release_notes: boolean | undefined,
  maxRetries: number,
  previous_tag_name: string | undefined,
): Promise<ReleaseResult> {
  const tag_name = tag;
  const name = config.input_name || tag;
  const body = releaseBody(config);
  const prerelease = config.input_prerelease;
  const draft = prerelease === true ? config.input_draft === true : true;
  const target_commitish = config.input_target_commitish;
  const make_latest = config.input_make_latest;
  let commitMessage: string = '';
  if (target_commitish) {
    commitMessage = `，使用 commit "${target_commitish}"`;
  }
  console.log(`👩‍🏭 正在为标签 ${tag_name} 创建新的 GitHub Release${commitMessage}...`);
  try {
    const createdRelease = await releaser.createRelease({
      owner,
      repo,
      tag_name,
      name,
      body,
      draft,
      prerelease,
      target_commitish,
      discussion_category_name,
      generate_release_notes,
      make_latest,
      previous_tag_name,
    });
    const canonicalRelease = await canonicalizeCreatedRelease(
      releaser,
      owner,
      repo,
      tag_name,
      createdRelease.data,
      maxRetries,
    );
    return {
      release: canonicalRelease,
      created: canonicalRelease.id === createdRelease.data.id,
    };
  } catch (error) {
    // 推测是与并行运行的竞争条件
    console.log(`⚠️ GitHub Release 创建失败，状态码：${error.status}`);
    console.log(`${JSON.stringify(error.response.data)}`);

    switch (error.status) {
      case 403:
        console.log(
          '跳过重试 — 您的 GitHub Token/PAT 没有创建 Release 所需的权限',
        );
        throw error;

      case 404:
        console.log('跳过重试 — 讨论分类不匹配');
        throw error;

      case 422:
        // 检查是否为 "already_exists" 错误（竞争条件）
        const errorData = error.response?.data;
        if (errorData?.errors?.[0]?.code === 'already_exists') {
          console.log(
            '⚠️ Release 已存在（检测到竞争条件），正在重试查找并更新现有 Release...',
          );
          // 不抛出异常 - 允许重试并查找现有 Release
        } else {
          console.log('跳过重试 — 验证失败');
          throw error;
        }
        break;
    }

    console.log(`正在重试...（剩余 ${maxRetries - 1} 次重试机会）`);
    // 随机延迟 1~3 秒，错开矩阵 Job 的重试时间
    await sleep(UPDATE_RACE_RETRY_DELAY_MS + randomInt(1000));
    return release(config, releaser, maxRetries - 1);
  }
}

function isTagCreationBlockedError(error: any): boolean {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors) || error?.status !== 422) {
    return false;
  }

  return errors.some(
    ({ field, message }: { field?: string; message?: string }) =>
      field === 'pre_receive' &&
      typeof message === 'string' &&
      message.includes('creations being restricted'),
  );
}
