import { callback } from "awaiting";
import SftpFuse, { IClientOptions } from "./sftp-fuse";
import Fuse from "@cocalc/fuse-native";
import debug from "debug";

const log = debug("websocketfs:mount");

interface Options {
  path: string; // e.g., ./mnt
  remote: string; // e.g., websocket server -- ws://localhost:4389
  // NOTE: we change some options from the defaults, but you can set anything
  // explicitly via mountOptions, overriding our non-default options.
  mountOptions?: Fuse.OPTIONS;
  connectOptions?: IClientOptions;
  reconnect?: boolean;
  cacheTimeout?: number;
  cacheStatTimeout?: number;
  cacheDirTimeout?: number;
  cacheLinkTimeout?: number;
}

export default async function mount(
  opts: Options,
): Promise<{ fuse: Fuse; client: SftpFuse; unmount: () => Promise<void> }> {
  log("mount", opts);
  const {
    path,
    remote,
    connectOptions,
    mountOptions,
    reconnect,
    cacheTimeout,
    cacheStatTimeout,
    cacheDirTimeout,
    cacheLinkTimeout,
  } = opts;

  const client = new SftpFuse(remote, {
    cacheTimeout,
    reconnect,
    cacheStatTimeout,
    cacheDirTimeout,
    cacheLinkTimeout,
  });
  await client.connect(connectOptions);
  const fuse = new Fuse(path, client, {
    debug: log.enabled,
    force: true,
    mkdir: true,
    fsname: remote,
    autoUnmount: true, // doesn't seem to work, hence the process exit hook below.
    ...mountOptions,
  });
  await callback(fuse.mount.bind(fuse));
  const unmount = async () => {
    log("unmounting", opts);
    await callback(fuse.unmount.bind(fuse));
    client.end();
  };
  process.once("exit", (code) => {
    log("fuse unmount on exit");
    fuse.unmount(() => {});
    process.exit(code);
  });
  return { fuse, client, unmount };
}
