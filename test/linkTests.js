const path = require('path');
const test = require('ava').test;
const rewire = require('rewire');

test.before(require('./checkNodeVersion'));

const mockFs = require('./mockFs');
const testHome = mockFs.fixSep('/home/test/nvs/');

global.settings = {
    home: testHome,
    aliases: {},
    remotes: {
        'test': 'http://example.com/test',
    },
    skipUpdateShellEnv: true,
    linkToSystem: false,
};

const linkPath = testHome + 'default';

const NodeVersion = require('../lib/version');
const nvsLink = rewire('../lib/link');
const nvsUse = rewire('../lib/use');
const nvsList = rewire('../lib/list');
nvsLink.__set__('nvsUse', nvsUse);
nvsUse.__set__('nvsLink', nvsLink);
nvsLink.__set__('nvsList', nvsList);
nvsUse.__set__('nvsList', nvsList);
nvsList.__set__('nvsUse', nvsUse);

const bin = (nvsUse.isWindows ? '' : '/bin');
const exe = (nvsUse.isWindows ? 'node.exe' : 'node');

nvsUse.__set__('fs', mockFs);
nvsLink.__set__('fs', mockFs);
nvsList.__set__('fs', mockFs);

let mockWindowsEnv = {
    getEnvironmentVariable() {
        return '';
    },
    setEnvironmentVariable() {
    }
};
nvsLink.__set__('nvsWindowsEnv', mockWindowsEnv);

function setPath(pathEntries) {
    process.env['PATH'] = pathEntries
        .map(entry => Array.isArray(entry) ? path.join(...entry) : entry)
        .map(mockFs.fixSep)
        .join(path.delimiter);
}

function getPath() {
    return process.env['PATH'].split(path.delimiter);
}

test.beforeEach(t => {
    mockFs.reset();

    mockFs.mockDir(testHome, ['test', 'test2']);
    mockFs.mockDir(path.join(testHome, 'test'), ['5.6.7']);
    mockFs.mockDir(path.join(testHome, 'test', '5.6.7'), ['x86', 'x64']);
    mockFs.mockDir(path.join(testHome, 'test', '5.6.7', 'x86'), []);
    mockFs.mockDir(path.join(testHome, 'test', '5.6.7', 'x64'), []);
    mockFs.mockDir(path.join(testHome, 'test2'), ['5.6.7']);
    mockFs.mockDir(path.join(testHome, 'test2', '5.6.7'), ['x86', 'x64']);
    mockFs.mockDir(path.join(testHome, 'test2', '5.6.7', 'x86'), []);
    mockFs.mockDir(path.join(testHome, 'test2', '5.6.7', 'x64'), []);
    mockFs.mockFile(path.join(testHome, 'test1', '5.6.7', 'x86', bin, exe));
    mockFs.mockFile(path.join(testHome, 'test1', '5.6.7', 'x64', bin, exe));
    mockFs.mockFile(path.join(testHome, 'test2', '6.7.8', 'x64', bin, exe));
});

test('Get linked version', t => {
    if (nvsUse.isWindows) {
        mockFs.mockLink(linkPath, path.join(testHome, 'test/5.6.7/x64'));
    } else {
        mockFs.mockLink(linkPath, 'test/5.6.7/x64');
    }

    let v = nvsLink.getLinkedVersion();
    t.truthy(v);
    t.is(v.remoteName, 'test');
    t.is(v.semanticVersion, '5.6.7');
    t.is(v.arch, 'x64');
});

test('Get version from PATH - linked', t => {
    if (nvsUse.isWindows) {
        mockFs.mockLink(linkPath, path.join(testHome, 'test/5.6.7/x64'));
    } else {
        mockFs.mockLink(linkPath, 'test/5.6.7/x64');
    }

    setPath([
        linkPath + bin,
        '/bin',
    ]);

    let v = nvsUse.getCurrentVersion();
    t.truthy(v);
    t.is(v.remoteName, 'test');
    t.is(v.semanticVersion, '5.6.7');
    t.is(v.arch, 'x64');
});

test('Link - specified version', t => {
    mockFs.mockFile(testHome + 'test/5.6.7/x64' + bin + '/' + exe);

    nvsLink.link(new NodeVersion('test', '5.6.7', 'x64'));

    if (nvsUse.isWindows) {
        t.is(mockFs.linkMap[linkPath],
            path.join(testHome, 'test\\5.6.7\\x64'));
    } else {
        t.is(mockFs.linkMap[linkPath], 'test/5.6.7/x64');
    }
});

test('Link - current version from PATH', t => {
    mockFs.mockFile(testHome + 'test/5.6.7/x64' + bin + '/' + exe);
    setPath([
        testHome + 'test/5.6.7/x64' + bin + '/',
        '/bin',
    ]);

    nvsLink.link();

    if (nvsUse.isWindows) {
        t.is(mockFs.linkMap[linkPath],
            path.join(testHome, 'test\\5.6.7\\x64'));
    } else {
        t.is(mockFs.linkMap[linkPath], 'test/5.6.7/x64');
    }
});

test('Unlink - specified version', t => {
    mockFs.mockFile(testHome + 'test/5.6.7/x64' + bin + '/' + exe);

    if (nvsUse.isWindows) {
        mockFs.mockLink(linkPath, path.join(testHome, 'test/5.6.7/x64'));
    } else {
        mockFs.mockLink(linkPath, 'test/5.6.7/x64');
    }

    setPath([
        linkPath + bin,
        '/bin',
    ]);

    nvsLink.unlink(new NodeVersion('test', '5.6.7', 'x64'));

    t.is(mockFs.unlinkPaths.length, 1);
    t.is(mockFs.unlinkPaths[0], linkPath);
    t.falsy(mockFs.linkMap[linkPath]);

    let newPath = getPath();
    t.deepEqual(newPath, [mockFs.fixSep('/bin')]);
});

test('Unlink - different version', t => {
    if (nvsUse.isWindows) {
        mockFs.mockLink(linkPath, path.join(testHome, 'test/5.6.7/x64'));
    } else {
        mockFs.mockLink(linkPath, 'test/5.6.7/x64');
    }

    setPath([
        linkPath + bin,
        '/bin',
    ]);

    nvsLink.unlink(new NodeVersion('test2', '5.6.7', 'x64'));

    t.is(mockFs.unlinkPaths.length, 0);
    t.truthy(mockFs.linkMap[linkPath]);

    let newPath = getPath();
    t.is(newPath.length, 2);
});

test('Unlink - any version', t => {
    if (nvsUse.isWindows) {
        mockFs.mockLink(linkPath, path.join(testHome, 'test/5.6.7/x64'));
    } else {
        mockFs.mockLink(linkPath, 'test/5.6.7/x64');
    }

    setPath([
        linkPath + bin,
        '/bin',
    ]);

    nvsLink.unlink();

    t.is(mockFs.unlinkPaths.length, 1);
    t.is(mockFs.unlinkPaths[0], linkPath);
    t.falsy(mockFs.linkMap[linkPath]);

    let newPath = getPath();
    t.deepEqual(newPath, [mockFs.fixSep('/bin')]);
});

test('Unlink - no link', t => {
    setPath([
        '/bin',
    ]);

    nvsLink.unlink();
    t.is(mockFs.unlinkPaths.length, 0);

    let newPath = getPath();
    t.deepEqual(newPath, [mockFs.fixSep('/bin')]);
});

test.todo('Link - link to system');
test.todo('Link - when system node is present');
test.todo('Unlink - unlink from system');
test.todo('Unlink - when system node is present');
test.todo('Get version from PATH - system linked');
