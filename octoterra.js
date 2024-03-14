// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

"use strict";

(() => {
    const enosys = () => {
        const err = new Error("not implemented");
        err.code = "ENOSYS";
        return err;
    };

    if (!globalThis.fs) {
        let outputBuf = "";
        globalThis.fs = {
            constants: {O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1}, // unused
            writeSync(fd, buf) {
                outputBuf += decoder.decode(buf);
                const nl = outputBuf.lastIndexOf("\n");
                if (nl != -1) {
                    console.log(outputBuf.substring(0, nl));
                    outputBuf = outputBuf.substring(nl + 1);
                }
                return buf.length;
            },
            write(fd, buf, offset, length, position, callback) {
                if (offset !== 0 || length !== buf.length || position !== null) {
                    callback(enosys());
                    return;
                }
                const n = this.writeSync(fd, buf);
                callback(null, n);
            },
            chmod(path, mode, callback) {
                callback(enosys());
            },
            chown(path, uid, gid, callback) {
                callback(enosys());
            },
            close(fd, callback) {
                callback(enosys());
            },
            fchmod(fd, mode, callback) {
                callback(enosys());
            },
            fchown(fd, uid, gid, callback) {
                callback(enosys());
            },
            fstat(fd, callback) {
                callback(enosys());
            },
            fsync(fd, callback) {
                callback(null);
            },
            ftruncate(fd, length, callback) {
                callback(enosys());
            },
            lchown(path, uid, gid, callback) {
                callback(enosys());
            },
            link(path, link, callback) {
                callback(enosys());
            },
            lstat(path, callback) {
                callback(enosys());
            },
            mkdir(path, perm, callback) {
                callback(enosys());
            },
            open(path, flags, mode, callback) {
                callback(enosys());
            },
            read(fd, buffer, offset, length, position, callback) {
                callback(enosys());
            },
            readdir(path, callback) {
                callback(enosys());
            },
            readlink(path, callback) {
                callback(enosys());
            },
            rename(from, to, callback) {
                callback(enosys());
            },
            rmdir(path, callback) {
                callback(enosys());
            },
            stat(path, callback) {
                callback(enosys());
            },
            symlink(path, link, callback) {
                callback(enosys());
            },
            truncate(path, length, callback) {
                callback(enosys());
            },
            unlink(path, callback) {
                callback(enosys());
            },
            utimes(path, atime, mtime, callback) {
                callback(enosys());
            },
        };
    }

    if (!globalThis.process) {
        globalThis.process = {
            getuid() {
                return -1;
            },
            getgid() {
                return -1;
            },
            geteuid() {
                return -1;
            },
            getegid() {
                return -1;
            },
            getgroups() {
                throw enosys();
            },
            pid: -1,
            ppid: -1,
            umask() {
                throw enosys();
            },
            cwd() {
                throw enosys();
            },
            chdir() {
                throw enosys();
            },
        }
    }

    if (!globalThis.crypto) {
        throw new Error("globalThis.crypto is not available, polyfill required (crypto.getRandomValues only)");
    }

    if (!globalThis.performance) {
        throw new Error("globalThis.performance is not available, polyfill required (performance.now only)");
    }

    if (!globalThis.TextEncoder) {
        throw new Error("globalThis.TextEncoder is not available, polyfill required");
    }

    if (!globalThis.TextDecoder) {
        throw new Error("globalThis.TextDecoder is not available, polyfill required");
    }

    const encoder = new TextEncoder("utf-8");
    const decoder = new TextDecoder("utf-8");

    globalThis.Go = class {
        constructor() {
            this.argv = ["js"];
            this.env = {};
            this.exit = (code) => {
                if (code !== 0) {
                    console.warn("exit code:", code);
                }
            };
            this._exitPromise = new Promise((resolve) => {
                this._resolveExitPromise = resolve;
            });
            this._pendingEvent = null;
            this._scheduledTimeouts = new Map();
            this._nextCallbackTimeoutID = 1;

            const setInt64 = (addr, v) => {
                this.mem.setUint32(addr + 0, v, true);
                this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true);
            }

            const setInt32 = (addr, v) => {
                this.mem.setUint32(addr + 0, v, true);
            }

            const getInt64 = (addr) => {
                const low = this.mem.getUint32(addr + 0, true);
                const high = this.mem.getInt32(addr + 4, true);
                return low + high * 4294967296;
            }

            const loadValue = (addr) => {
                const f = this.mem.getFloat64(addr, true);
                if (f === 0) {
                    return undefined;
                }
                if (!isNaN(f)) {
                    return f;
                }

                const id = this.mem.getUint32(addr, true);
                return this._values[id];
            }

            const storeValue = (addr, v) => {
                const nanHead = 0x7FF80000;

                if (typeof v === "number" && v !== 0) {
                    if (isNaN(v)) {
                        this.mem.setUint32(addr + 4, nanHead, true);
                        this.mem.setUint32(addr, 0, true);
                        return;
                    }
                    this.mem.setFloat64(addr, v, true);
                    return;
                }

                if (v === undefined) {
                    this.mem.setFloat64(addr, 0, true);
                    return;
                }

                let id = this._ids.get(v);
                if (id === undefined) {
                    id = this._idPool.pop();
                    if (id === undefined) {
                        id = this._values.length;
                    }
                    this._values[id] = v;
                    this._goRefCounts[id] = 0;
                    this._ids.set(v, id);
                }
                this._goRefCounts[id]++;
                let typeFlag = 0;
                switch (typeof v) {
                    case "object":
                        if (v !== null) {
                            typeFlag = 1;
                        }
                        break;
                    case "string":
                        typeFlag = 2;
                        break;
                    case "symbol":
                        typeFlag = 3;
                        break;
                    case "function":
                        typeFlag = 4;
                        break;
                }
                this.mem.setUint32(addr + 4, nanHead | typeFlag, true);
                this.mem.setUint32(addr, id, true);
            }

            const loadSlice = (addr) => {
                const array = getInt64(addr + 0);
                const len = getInt64(addr + 8);
                return new Uint8Array(this._inst.exports.mem.buffer, array, len);
            }

            const loadSliceOfValues = (addr) => {
                const array = getInt64(addr + 0);
                const len = getInt64(addr + 8);
                const a = new Array(len);
                for (let i = 0; i < len; i++) {
                    a[i] = loadValue(array + i * 8);
                }
                return a;
            }

            const loadString = (addr) => {
                const saddr = getInt64(addr + 0);
                const len = getInt64(addr + 8);
                return decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len));
            }

            const timeOrigin = Date.now() - performance.now();
            this.importObject = {
                _gotest: {
                    add: (a, b) => a + b,
                },
                gojs: {
                    // Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
                    // may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
                    // function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
                    // This changes the SP, thus we have to update the SP used by the imported function.

                    // func wasmExit(code int32)
                    "runtime.wasmExit": (sp) => {
                        sp >>>= 0;
                        const code = this.mem.getInt32(sp + 8, true);
                        this.exited = true;
                        delete this._inst;
                        delete this._values;
                        delete this._goRefCounts;
                        delete this._ids;
                        delete this._idPool;
                        this.exit(code);
                    },

                    // func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
                    "runtime.wasmWrite": (sp) => {
                        sp >>>= 0;
                        const fd = getInt64(sp + 8);
                        const p = getInt64(sp + 16);
                        const n = this.mem.getInt32(sp + 24, true);
                        fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
                    },

                    // func resetMemoryDataView()
                    "runtime.resetMemoryDataView": (sp) => {
                        sp >>>= 0;
                        this.mem = new DataView(this._inst.exports.mem.buffer);
                    },

                    // func nanotime1() int64
                    "runtime.nanotime1": (sp) => {
                        sp >>>= 0;
                        setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
                    },

                    // func walltime() (sec int64, nsec int32)
                    "runtime.walltime": (sp) => {
                        sp >>>= 0;
                        const msec = (new Date).getTime();
                        setInt64(sp + 8, msec / 1000);
                        this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
                    },

                    // func scheduleTimeoutEvent(delay int64) int32
                    "runtime.scheduleTimeoutEvent": (sp) => {
                        sp >>>= 0;
                        const id = this._nextCallbackTimeoutID;
                        this._nextCallbackTimeoutID++;
                        this._scheduledTimeouts.set(id, setTimeout(
                            () => {
                                this._resume();
                                while (this._scheduledTimeouts.has(id)) {
                                    // for some reason Go failed to register the timeout event, log and try again
                                    // (temporary workaround for https://github.com/golang/go/issues/28975)
                                    console.warn("scheduleTimeoutEvent: missed timeout event");
                                    this._resume();
                                }
                            },
                            getInt64(sp + 8),
                        ));
                        this.mem.setInt32(sp + 16, id, true);
                    },

                    // func clearTimeoutEvent(id int32)
                    "runtime.clearTimeoutEvent": (sp) => {
                        sp >>>= 0;
                        const id = this.mem.getInt32(sp + 8, true);
                        clearTimeout(this._scheduledTimeouts.get(id));
                        this._scheduledTimeouts.delete(id);
                    },

                    // func getRandomData(r []byte)
                    "runtime.getRandomData": (sp) => {
                        sp >>>= 0;
                        crypto.getRandomValues(loadSlice(sp + 8));
                    },

                    // func finalizeRef(v ref)
                    "syscall/js.finalizeRef": (sp) => {
                        sp >>>= 0;
                        const id = this.mem.getUint32(sp + 8, true);
                        this._goRefCounts[id]--;
                        if (this._goRefCounts[id] === 0) {
                            const v = this._values[id];
                            this._values[id] = null;
                            this._ids.delete(v);
                            this._idPool.push(id);
                        }
                    },

                    // func stringVal(value string) ref
                    "syscall/js.stringVal": (sp) => {
                        sp >>>= 0;
                        storeValue(sp + 24, loadString(sp + 8));
                    },

                    // func valueGet(v ref, p string) ref
                    "syscall/js.valueGet": (sp) => {
                        sp >>>= 0;
                        const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16));
                        sp = this._inst.exports.getsp() >>> 0; // see comment above
                        storeValue(sp + 32, result);
                    },

                    // func valueSet(v ref, p string, x ref)
                    "syscall/js.valueSet": (sp) => {
                        sp >>>= 0;
                        Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 32));
                    },

                    // func valueDelete(v ref, p string)
                    "syscall/js.valueDelete": (sp) => {
                        sp >>>= 0;
                        Reflect.deleteProperty(loadValue(sp + 8), loadString(sp + 16));
                    },

                    // func valueIndex(v ref, i int) ref
                    "syscall/js.valueIndex": (sp) => {
                        sp >>>= 0;
                        storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)));
                    },

                    // valueSetIndex(v ref, i int, x ref)
                    "syscall/js.valueSetIndex": (sp) => {
                        sp >>>= 0;
                        Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24));
                    },

                    // func valueCall(v ref, m string, args []ref) (ref, bool)
                    "syscall/js.valueCall": (sp) => {
                        sp >>>= 0;
                        try {
                            const v = loadValue(sp + 8);
                            const m = Reflect.get(v, loadString(sp + 16));
                            const args = loadSliceOfValues(sp + 32);
                            const result = Reflect.apply(m, v, args);
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 56, result);
                            this.mem.setUint8(sp + 64, 1);
                        } catch (err) {
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 56, err);
                            this.mem.setUint8(sp + 64, 0);
                        }
                    },

                    // func valueInvoke(v ref, args []ref) (ref, bool)
                    "syscall/js.valueInvoke": (sp) => {
                        sp >>>= 0;
                        try {
                            const v = loadValue(sp + 8);
                            const args = loadSliceOfValues(sp + 16);
                            const result = Reflect.apply(v, undefined, args);
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 40, result);
                            this.mem.setUint8(sp + 48, 1);
                        } catch (err) {
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 40, err);
                            this.mem.setUint8(sp + 48, 0);
                        }
                    },

                    // func valueNew(v ref, args []ref) (ref, bool)
                    "syscall/js.valueNew": (sp) => {
                        sp >>>= 0;
                        try {
                            const v = loadValue(sp + 8);
                            const args = loadSliceOfValues(sp + 16);
                            const result = Reflect.construct(v, args);
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 40, result);
                            this.mem.setUint8(sp + 48, 1);
                        } catch (err) {
                            sp = this._inst.exports.getsp() >>> 0; // see comment above
                            storeValue(sp + 40, err);
                            this.mem.setUint8(sp + 48, 0);
                        }
                    },

                    // func valueLength(v ref) int
                    "syscall/js.valueLength": (sp) => {
                        sp >>>= 0;
                        setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
                    },

                    // valuePrepareString(v ref) (ref, int)
                    "syscall/js.valuePrepareString": (sp) => {
                        sp >>>= 0;
                        const str = encoder.encode(String(loadValue(sp + 8)));
                        storeValue(sp + 16, str);
                        setInt64(sp + 24, str.length);
                    },

                    // valueLoadString(v ref, b []byte)
                    "syscall/js.valueLoadString": (sp) => {
                        sp >>>= 0;
                        const str = loadValue(sp + 8);
                        loadSlice(sp + 16).set(str);
                    },

                    // func valueInstanceOf(v ref, t ref) bool
                    "syscall/js.valueInstanceOf": (sp) => {
                        sp >>>= 0;
                        this.mem.setUint8(sp + 24, (loadValue(sp + 8) instanceof loadValue(sp + 16)) ? 1 : 0);
                    },

                    // func copyBytesToGo(dst []byte, src ref) (int, bool)
                    "syscall/js.copyBytesToGo": (sp) => {
                        sp >>>= 0;
                        const dst = loadSlice(sp + 8);
                        const src = loadValue(sp + 32);
                        if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
                            this.mem.setUint8(sp + 48, 0);
                            return;
                        }
                        const toCopy = src.subarray(0, dst.length);
                        dst.set(toCopy);
                        setInt64(sp + 40, toCopy.length);
                        this.mem.setUint8(sp + 48, 1);
                    },

                    // func copyBytesToJS(dst ref, src []byte) (int, bool)
                    "syscall/js.copyBytesToJS": (sp) => {
                        sp >>>= 0;
                        const dst = loadValue(sp + 8);
                        const src = loadSlice(sp + 16);
                        if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
                            this.mem.setUint8(sp + 48, 0);
                            return;
                        }
                        const toCopy = src.subarray(0, dst.length);
                        dst.set(toCopy);
                        setInt64(sp + 40, toCopy.length);
                        this.mem.setUint8(sp + 48, 1);
                    },

                    "debug": (value) => {
                        console.log(value);
                    },
                }
            };
        }

        async run(instance) {
            if (!(instance instanceof WebAssembly.Instance)) {
                throw new Error("Go.run: WebAssembly.Instance expected");
            }
            this._inst = instance;
            this.mem = new DataView(this._inst.exports.mem.buffer);
            this._values = [ // JS values that Go currently has references to, indexed by reference id
                NaN,
                0,
                null,
                true,
                false,
                globalThis,
                this,
            ];
            this._goRefCounts = new Array(this._values.length).fill(Infinity); // number of references that Go has to a JS value, indexed by reference id
            this._ids = new Map([ // mapping from JS values to reference ids
                [0, 1],
                [null, 2],
                [true, 3],
                [false, 4],
                [globalThis, 5],
                [this, 6],
            ]);
            this._idPool = [];   // unused ids that have been garbage collected
            this.exited = false; // whether the Go program has exited

            // Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
            let offset = 4096;

            const strPtr = (str) => {
                const ptr = offset;
                const bytes = encoder.encode(str + "\0");
                new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes);
                offset += bytes.length;
                if (offset % 8 !== 0) {
                    offset += 8 - (offset % 8);
                }
                return ptr;
            };

            const argc = this.argv.length;

            const argvPtrs = [];
            this.argv.forEach((arg) => {
                argvPtrs.push(strPtr(arg));
            });
            argvPtrs.push(0);

            const keys = Object.keys(this.env).sort();
            keys.forEach((key) => {
                argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
            });
            argvPtrs.push(0);

            const argv = offset;
            argvPtrs.forEach((ptr) => {
                this.mem.setUint32(offset, ptr, true);
                this.mem.setUint32(offset + 4, 0, true);
                offset += 8;
            });

            // The linker guarantees global data starts from at least wasmMinDataAddr.
            // Keep in sync with cmd/link/internal/ld/data.go:wasmMinDataAddr.
            const wasmMinDataAddr = 4096 + 8192;
            if (offset >= wasmMinDataAddr) {
                throw new Error("total length of command line and environment variables exceeds limit");
            }

            this._inst.exports.run(argc, argv);
            if (this.exited) {
                this._resolveExitPromise();
            }
            await this._exitPromise;
        }

        _resume() {
            if (this.exited) {
                throw new Error("Go program has already exited");
            }
            this._inst.exports.resume();
            if (this.exited) {
                this._resolveExitPromise();
            }
        }

        _makeFuncWrapper(id) {
            const go = this;
            return function () {
                const event = {id: id, this: this, args: arguments};
                go._pendingEvent = event;
                go._resume();
                return event.result;
            };
        }
    }
})();

/********************************/
// Custom scripts starts here
/********************************/
const error = "An exception was thrown. If you are using this extension in early 2024, this may be a temporary error, and you can try again later. "
    + "If you are using the extension in late 2024, this extension is likely deprecated."
const go = new Go();

function is_empty_array(array) {
    return typeof array === 'undefined' || array === null || array.length === 0
}

function log(message) {
    console.log(message)
}

function queryLlm(query, sendResponse) {
    chrome.tabs.query({active: true, lastFocusedWindow: true}, tabs => {
        const url = new URL(tabs[0].url)
        const space = tabs[0].url.split("/")[4]

        const promises = [
            fetch("https://octopuscopilotproduction.azurewebsites.net/api/query_parse?message=" + encodeURIComponent(query))
                .then(response => response.json()),
            fetch("convert_project.wasm")
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => WebAssembly.instantiate(arrayBuffer, go.importObject))
        ]

        Promise.all(promises)
            .then(results => {
                const entities = results[0]
                const wasm = results[1]

                go.run(wasm.instance);

                log("URL and space")
                log(JSON.stringify(url.origin))
                log(JSON.stringify(space))

                const excludeAllProjects = is_empty_array(entities.project_names) &&
                    query.toLowerCase().indexOf("project") === -1
                const excludeAllTargets = is_empty_array(entities.target_names) &&
                    query.toLowerCase().indexOf("target") === -1
                const excludeAllRunbooks = is_empty_array(entities.runbook_names) &&
                    query.toLowerCase().indexOf("runbook") === -1
                const excludeAllVariableSets = is_empty_array(entities.library_variable_sets) &&
                    query.toLowerCase().indexOf("library variable set") === -1
                const excludeAllTenants = is_empty_array(entities.tenant_names) &&
                    query.toLowerCase().indexOf("tenant") === -1
                const excludeAllEnvironments = is_empty_array(entities.environment_names) &&
                    query.toLowerCase().indexOf("environment") === -1
                const excludeAllFeeds = is_empty_array(entities.feed_names) &&
                    query.toLowerCase().indexOf("feed") === -1
                const excludeAllAccounts = is_empty_array(entities.account_names) &&
                    query.toLowerCase().indexOf("account") === -1
                const excludeAllCertificates = is_empty_array(entities.certificate_names) &&
                    query.toLowerCase().indexOf("certificate") === -1
                const excludeAllLifecycles = is_empty_array(entities.lifecycle_names) &&
                    query.toLowerCase().indexOf("lifecycle") === -1
                const excludeAllWorkerpools = is_empty_array(entities.workerpool_names) &&
                    query.toLowerCase().indexOf("pool") === -1
                const excludeAllMachinePolicies = is_empty_array(entities.machinepolicy_names) &&
                    query.toLowerCase().indexOf("policy") === -1
                const excludeAllTagSets = is_empty_array(entities.tagset_names) &&
                    query.toLowerCase().indexOf("tag") === -1
                const excludeAllProjectGroups = is_empty_array(entities.projectgroup_names) &&
                    query.toLowerCase().indexOf("project group") === -1

                log("Arguments")
                log("URL: " + url.origin)
                log("Space: " + space)
                log("Exclude All Projects: " + excludeAllProjects)
                log("Project Names: " + (entities.project_names ? entities.project_names.join(",") : ""))
                log("Exclude All Targets: " + excludeAllTargets)
                log("Targets: " + (entities.target_names ? entities.target_names.join(",") : ""))
                log("Exclude All Runbooks: " + excludeAllRunbooks)
                log("Runbook Names: " + (entities.runbook_names ? entities.runbook_names.join(",") : ""))
                log("Exclude All Variable Sets: " + excludeAllVariableSets)
                log("Variable Sets: " + (entities.library_variable_sets ? entities.library_variable_sets.join(",") : ""))
                log("Exclude All Tenants: " + excludeAllTenants)
                log("Tenants: " + (entities.tenant_names ? entities.tenant_names.join(",") : ""))
                log("Exclude All Environments: " + excludeAllEnvironments)
                log("Environments: " + (entities.environment_names ? entities.environment_names.join(",") : ""))
                log("Exclude All Feeds: " + excludeAllFeeds)
                log("Feeds: " + (entities.feed_names ? entities.feed_names.join(",") : ""))
                log("Exclude All Accounts: " + excludeAllAccounts)
                log("Accounts: " + (entities.account_names ? entities.account_names.join(",") : ""))
                log("Exclude All Certificates: " + excludeAllCertificates)
                log("Certificates: " + (entities.certificate_names ? entities.certificate_names.join(",") : ""))
                log("Exclude All Lifecycles: " + excludeAllLifecycles)
                log("Lifecycles: " + (entities.lifecycle_names ? entities.lifecycle_names.join(",") : ""))
                log("Exclude All Worker Pools: " + excludeAllWorkerpools)
                log("Worker Pools: " + (entities.workerpool_names ? entities.workerpool_names.join(",") : ""))
                log("Exclude All Machine Policies: " + excludeAllMachinePolicies)
                log("Machine Policies: " + (entities.machinepolicy_names ? entities.machinepolicy_names.join(",") : ""))
                log("Exclude All Tag Sets: " + excludeAllTagSets)
                log("Tag Sets: " + (entities.tagset_names ? entities.tagset_names.join(",") : ""))
                log("Exclude All Project Groups: " + excludeAllProjectGroups)
                log("Project Groups: " + (entities.projectgroup_names ? entities.projectgroup_names.join(",") : ""))
                log("Channels: " + (entities.channel_names ? entities.channel_names.join(",") : ""))
                log("Release Versions: " + (entities.release_versions ? entities.release_versions.join(",") : ""))

                const promises = getContext(url, space, entities, query)

                return Promise.all(promises)
            })
            .then(results => {
                const context = results.join("\n\n")

                log("Space Context")
                log(context)

                return fetch("https://octopuscopilotproduction.azurewebsites.net/api/submit_query?message=" + encodeURIComponent(query),
                    {
                        method: "POST",
                        body: context
                    })
            })
            .then(response => response.text())
            .then(answer => sendResponse({answer: answer}))
            .catch(error => sendResponse({answer: error}))
    })
}


function getContext(url, space, entities, query) {
    let promises = []

    if (requiresReleaseHistory(query)) {
        promises.push(...getReleaseHistory(url, space, entities.project_names))
    }

    if (requiresReleaseLogs(query, entities.project_names)) {
        if (entities.environment_names) {
            promises.push(getReleaseLogs(url, space, entities.project_names[0], entities.environment_names[0], "latest"))
        } else {
            promises.push(getReleaseLogs(url, space, entities.project_names[0], null, "latest"))
        }
    } else {
        const promise = convertSpace(
            url.origin,
            space,
            excludeAllProjects,
            entities.project_names ? entities.project_names.join(",") : "",
            excludeAllTargets,
            entities.target_names ? entities.target_names.join(",") : "",
            excludeAllRunbooks,
            entities.runbook_names ? entities.runbook_names.join(",") : "",
            excludeAllVariableSets,
            entities.library_variable_sets ? entities.library_variable_sets.join(",") : "",
            excludeAllTenants,
            entities.tenant_names ? entities.tenant_names.join(",") : "",
            excludeAllEnvironments,
            entities.environment_names ? entities.environment_names.join(",") : "",
            excludeAllFeeds,
            entities.feed_names ? entities.feed_names.join(",") : "",
            excludeAllAccounts,
            entities.account_names ? entities.account_names.join(",") : "",
            excludeAllCertificates,
            entities.certificate_names ? entities.certificate_names.join(",") : "",
            excludeAllLifecycles,
            entities.lifecycle_names ? entities.lifecycle_names.join(",") : "",
            excludeAllWorkerpools,
            entities.workerpool_names ? entities.workerpool_names.join(",") : "",
            excludeAllMachinePolicies,
            entities.machinepolicy_names ? entities.machinepolicy_names.join(",") : "",
            excludeAllTagSets,
            entities.tagset_names ? entities.tagset_names.join(",") : "",
            excludeAllProjectGroups,
            entities.projectgroup_names ? entities.projectgroup_names.join(",") : ""
        )
        promises.push(promise)
    }
    return promises
}

function getProjectId(host, spaceId, projectName) {
    return fetch(`${host}/api/${spaceId}/Projects?partialName=${encodeURIComponent(projectName)}&take=10000`)
        .then(response => response.json())
        .then(json => {
            const projects = json["Items"].filter(item => item["Name"].toLowerCase() === projectName.toLowerCase())
            if (projects.length === 1) {
                return projects[0]["Id"]
            } else if (projects.length > 1) {
                const projectEntity = projects.filter(item => item["Name"] === projectName).pop()
                if (projectEntity) {
                    return projectEntity["Id"]
                }
            }

            throw "Could not find project " + projectName
        })
}

function getEnvironmentId(host, spaceId, environmentName) {
    return fetch(`${host}/api/${spaceId}/Environments?partialName=${encodeURIComponent(environmentName)}&take=10000`)
        .then(response => response.json())
        .then(json => {
            const projects = json["Items"].filter(item => item["Name"].toLowerCase() === environmentName.toLowerCase())
            if (projects.length === 1) {
                return projects[0]["Id"]
            } else if (projects.length > 1) {
                const projectEntity = projects.filter(item => item["Name"] === environmentName).pop()
                if (projectEntity) {
                    return projectEntity["Id"]
                }
            }

            throw "Could not find environment " + environmentName
        })
}

function requiresReleaseHistory(query) {
    return query.toLowerCase().indexOf("deployment") !== -1 || query.toLowerCase().indexOf("release") !== -1
}

function getReleaseHistory(url, space, project_names) {
    const promises = []
    if (project_names) {
        // Look at the release history of each project
        project_names.forEach(projectName => {
            const promise = getProjectId(url.origin, space, projectName)
                .then(projectId => fetch(`${url.origin}/api/${space}/Projects/${projectId}/Progression`))
                .then(response => response.text())
            promises.push(promise)
        })
    } else {
        // Look at the dashboard for a global view
        const promise = getProjectId(url.origin, space, projectName)
            .then(projectId => fetch(`${url.origin}/api/${space}/Dashboard`))
            .then(response => response.text())
        promises.push(promise)
    }
    return promises
}

function requiresReleaseLogs(query, projectNames) {
    if (!projectNames) {
        return false
    }
    return query.toLowerCase().indexOf("log") !== -1
}

function getReleaseLogs(url, space, projectName, environmentName, release_version) {
    return getProjectId(url.origin, space, projectName)
        .then(projectId => fetch(`${url.origin}/api/${space}/Projects/${projectId}/Progression`))
        .then(response => response.json())
        .then(progression => {
            if (!progression["Releases"]) {
                return []
            }

            // If an environment was mentioned, limit the deployments to the target environment
            if (environmentName) {
                return getEnvironmentId(url.origin, space, environmentName)
                    .then(environmentId => {
                        const releases = progression["Releases"].filter(release => Object.keys(release["Deployments"]).indexOf(environmentId) !== -1)

                        if (!releases) {
                            return []
                        }

                        return releases.map(release => release["Deployments"][environmentId]).flat()
                    })
            }

            // If no environment was specified, every deployment is a candidate
            return progression["Releases"].map(release => Object.values(release["Deployments"]).flat()).flat()
        })
        .then(deployments => {
            if (deployments.length === 0) {
                return null
            }

            if (release_version.toLowerCase() === "latest") {
                return deployments[0]["TaskId"]
            }

            const filtered = deployments.filter(release => release["ReleaseVersion"] === release_version)

            if (filtered.length === 0) {
                return null
            }

            return filtered[0]["TaskId"]
        })
        .then(taskId => {
            if (taskId === null) {
                return null
            }

            return fetch(`${url.origin}/api/${space}/tasks/${taskId}/details`)
        })
        .then(response => response.json())
        .then(task => {
            task["ActivityLogs"].map(logs => getLogs(logs)).join("\n")
        })
}

function getLogs(logItem) {
    if (!logItem["LogElements"] && !logItem["Children"]) {
        return "No logs found (status: " + logItem["Status"] + ")."
    }

    let logs = logItem["LogElements"].map(element => element["MessageText"]).join("\n")
    if (logItem["Children"]) {
        logItem["Children"].forEach(child => logs += "\n" + getLogs(child))
    }
    return logs
}

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        queryLlm(request.query, sendResponse)
        return true
    }
);

chrome.action.onClicked.addListener((tab) => {
    const url = new URL(tab.url)
    console.log(url.origin)
    if (url.origin.match(/https:\/\/.+?\.octopus\.app/)) {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ['content.js']
        });
    } else {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ['alert_error.js']
        });
    }
});