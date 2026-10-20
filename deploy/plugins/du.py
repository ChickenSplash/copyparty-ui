# coding: utf-8
# Folder sizes for the whole file store in one request: GET /api/_du.json
#
# Loaded with `on404: /cfg/plugins/du.py`, so copyparty only calls it for paths
# that don't exist; every other 404 falls through to the normal response.
#
# copyparty already keeps each folder's recursive size and file count in the
# `ds` table of every volume's index (that's where ?ls gets folder sizes from).
# This reads those tables for the volumes the user can read and merges them
# into one list, so the UI doesn't have to crawl every folder.
#
# Reply: {"v": 1, "dirs": [["", size, files], ["Backups", ...], ["Backups/Pictures", ...]]}
#   Paths are plain (not URL-encoded) and relative to the root, "" is the root.
#   Folders only, never file names. Dot-folders are left out, as in ?ls listings,
#   but their bytes still count towards their parent's total.
#
# Totals are copyparty's own, so they share its freshness: live for uploads and
# deletes, and right after each rescan (re-maxage) for files written outside it.
# copyparty 1.20.26 doesn't add a moved or renamed file back to the totals
# (_mv_file calls db_add with empty vflags), so they run short until a rescan.
#
# Replies 503 when a volume has no usable index (still being built, e2d off,
# nodirsz), and the UI falls back to crawling ?ls.
#
# Uses copyparty internals (cli.rvol, the VFS, the u2idx cursor pool), so a
# copyparty update can break it. It fails closed: an error is a 500 or 503, and
# the UI falls back to crawling.

import json

PATH = "_du.json"


def send(cli, status, obj):
    body = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    cli.reply(body, status, "application/json", headers={"Cache-Control": "no-store"})
    return "true"


def hidden(vpath):
    return any(seg.startswith(".") for seg in vpath.split("/") if seg)


def join(top, rd):
    return "/".join(x for x in (top, rd) if x)


def main(cli, vn, rem):
    if cli.vpath != PATH:
        return ""  # a real 404

    if cli.uname == "*" or not cli.rvol:
        return send(cli, 403, {"error": "not signed in"})

    idx = cli.conn.get_u2idx()
    if not idx:
        return send(cli, 503, {"error": "index busy"})

    sizes = {}  # vpath -> [bytes, files]
    vol_totals = []  # (volume vpath, bytes, files), added to its parents below
    vfs = cli.asrv.vfs
    for vtop in cli.rvol:
        vol = vfs.all_vols.get(vtop)
        # Skip jump nodes (virtual parents); only real volumes have their own index.
        if not vol or not vol.realpath or vol.dbv not in (vol, None):
            continue
        if hidden(vtop):
            continue
        if "nodirsz" in vol.flags:
            return send(cli, 503, {"error": "folder sizes are off for /" + vtop})
        cur = idx.get_cur(vol)
        if not cur:
            return send(cli, 503, {"error": "no index for /" + vtop})

        root = None
        for rd, sz, nf in cur.execute("select rd, sz, nf from ds"):
            if rd.startswith("//") or hidden(rd):
                continue  # mojibake names are stored base64-encoded; skip them
            if not rd:
                root = (sz, nf)
            sizes[join(vtop, rd)] = [sz, nf]
        if root is None:
            return send(cli, 503, {"error": "/%s is still being indexed" % (vtop,)})
        if vtop:
            vol_totals.append((vtop, root[0], root[1]))

    if not sizes:
        return send(cli, 503, {"error": "no index"})

    # A volume's scan skips the volumes mounted inside it, so add each mounted
    # volume's total to every folder above it.
    for vtop, sz, nf in vol_totals:
        segs = vtop.split("/")
        for i in range(len(segs)):
            entry = sizes.setdefault("/".join(segs[:i]), [0, 0])
            entry[0] += sz
            entry[1] += nf

    dirs = sorted([k, v[0], v[1]] for k, v in sizes.items())
    return send(cli, 200, {"v": 1, "dirs": dirs})
