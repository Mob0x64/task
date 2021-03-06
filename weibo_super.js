/*
地址
 |- https://github.com/Mob0x64/task

描述
 |- 微博超话签到，支持无限个账号。单账号可签到的超话个数有限制（具体为超话关注列表一页可获取超话个数），
    但这个限制大多数人应该都不会碰到，所以就没有实现分页获取了（主要是懒 XD）
       
配置（Quantumult X、Surge、Loon 理论上都是兼容的，其中Quantumult X 已经通过测试，其他自测，有问题可提 issue）
 |- 软件配置：
    |- Quantumult X：
      【本地】
       ^https:\/\/api\.weibo\.cn\/2\/(cardlist|page\/button) url script-request-header weibo_super.js
       0 1 0 * * * weibo_super.js, tag=超话签到, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/weibo.png, enabled=true

      【远程】
       ^https:\/\/api\.weibo\.cn\/2\/(cardlist|page\/button) url script-request-header https://raw.githubusercontent.com/Mob0x64/task/master/weibo_super.js
       0 1 0 * * * https://raw.githubusercontent.com/Mob0x64/task/master/weibo_super.js, tag=超话签到, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/weibo.png, enabled=true
  
    |- Surge：
       超话签到=type=cron,cronexp=0 1 0 * * *,wake-system=1,timeout=20,script-path=https://raw.githubusercontent.com/Mob0x64/task/master/weibo_super.js
       超话签到=type=http-request,pattern=^https:\/\/api\.weibo\.cn\/2\/(cardlist|page\/button),script-path=https://raw.githubusercontent.com/Mob0x64/task/master/weibo_super.js,requires-body=false

    |- Quantumult X、Surge、Loon 配置
      【MITM】
       hostname = api.weibo.cn
       (Surge 用户请注意：按说明获取完必要配置之后请去掉该 hostname 对应内容或者将 hostname 对应内容改为 api.weibo.cn.com 方便后续改回来)

特别说明
 |- BoxJS
    repo: https://github.com/chavyleung/scripts
    订阅地址：https://gist.githubusercontent.com/Mob0x64/f32cd9eb59d0e5c4116ed584af58ef36/raw/cedb662a4506b6ea6eddb6bbb802d3875a473f3e/mob64.boxjs
 |- 图标库
    https://github.com/Orz-3/mini
*/
let urlKey = {
    signIn: "signIn",
    followList: "followList"
}

let utils = magic({
    taskName: "微博超话签到"
});

let tokenManager = {
    tokenKey: "mob_weibo_sign_in_token",
    getTokenMap: () => {
        let tokenMapStr = utils.getData(tokenManager.tokenKey);
        return tokenMapStr ? JSON.parse(tokenMapStr) : {};
    },
    updateToken: token => {
        if (!token) throw "Token can not be null";
        let tokenMap = tokenManager.getTokenMap();
        tokenMap[token.gsid] = token;
        utils.setData(tokenManager.tokenKey, JSON.stringify(tokenMap));
    },
    getToken: gsid => {
        let tokenMap = tokenManager.getTokenMap();
        return tokenMap[gsid];
    },
    getTokens: () => {
        let tokenMap = tokenManager.getTokenMap();
        let tokenList = [];
        for (let key in tokenMap) tokenList.push(tokenMap[key]);
        return tokenList;
    }
}

utils.dispatch(() => {
    let taskExecute = (tokens, idx) => {
        if (idx >= tokens.length) return;
        let token = tokens[idx];
        let checkResult = checkToken(token);
        if (checkResult) {
            utils.notify("🔴签到失败", `GSID：${token.gsid}\n错误：${checkResult}`)
            return taskExecute(tokens, ++idx);
        }
        getFollowList(token, groups => {
            let resultCollector = {
                counter: 0,
                content: null,
                lines: groups.length,
                append: (groupName, success, content) => {
                    let line = `${success ? "🟢" : "🔴"}【${groupName}】${success ? "签到成功" : "签到失败"}，${content}`
                    resultCollector.content = resultCollector.content ? `${resultCollector.content}\n${line}` : line;
                    if (++resultCollector.counter == resultCollector.lines) {
                        utils.notify("", resultCollector.content);
                        taskExecute(tokens, ++idx);
                    }
                }
            };
            groups.forEach(group => {
                let groupName = group.title;
                if (group.status == 1) return resultCollector.append(groupName, false, "已经签到了～");
                signIn(token[urlKey.signIn], group.cid, body => {
                    if (body.result == 1) resultCollector.append(groupName, true, `${body.button.name}`);
                    else {
                        let errorInfo;
                        if (body.result == 388000) errorInfo = "需要验证码";
                        else if (body["error_msg"]) errorInfo = body["error_msg"];
                        else errorInfo = "发生未知错误，请通过日志排查问题";
                        resultCollector.append(groupName, false, errorInfo);
                    }
                }, error => resultCollector.append(groupName, false, `${JSON.stringify(error)}`));
            });
        }, error => {
            utils.notify("🔴签到异常", `GSID： ${token.gsid}\n 错误：${JSON.stringify(error)}`);
            taskExecute(tokens, ++idx);
        });
    }

    let tokens = tokenManager.getTokens();
    if (!tokens.length) return utils.notify("", "🔴还未进行相关配置，请参照说明配置后再进行签到～")
    taskExecute(tokens, 0);
}, () => {
    let content; 
    let url = $request.url; 
    let tokenUpdater = (key, url) => {
        let gsid = url.match(/gsid=(.*?)&/)[1];
        let token = tokenManager.getToken(gsid);
        token = token ? token : {};
        token.gsid = gsid;
        token[key] = url;
        tokenManager.updateToken(token);
    }
    if (url.startsWith("https://api.weibo.cn/2/cardlist?gsid=") && url.indexOf("followsuper") != -1) {
        tokenUpdater(urlKey.followList, url);
        content = "写入关注列表成功！";
    } else if (url.startsWith('https://api.weibo.cn/2/page/button?gsid=') && url.indexOf("active_checkin") != -1) {
        tokenUpdater(urlKey.signIn, url.replace(/&fid=.+?&/, "&fid=CID&").replace(/pageid%3D.+?%26/, "pageid%3dCID%26"));
        content = "写入签到配置成功！";
    } 
    if (content) utils.notify("", `✅ ${content}`);
});

function checkToken(token) {
    let checkResult = "";
    if (!token[urlKey.followList]) checkResult += "尚未配置超话关注列表信息\n";
    if (!token[urlKey.signIn]) checkResult += "尚未配置超话签到配置信息\n";
    return checkResult;
}

function signIn(url, cid, success, fail) {
    utils.httpGet(url.replace(/CID/g, cid), body => success(body), error => fail(error));
}

function getFollowList(token, success, fail) {
    utils.httpGet(token[urlKey.followList], body => {
        var groupList = [];
        body.cards[0].card_group.forEach(card => {
            if (card.card_type != "8" || card.buttons[0].name === "关注") return;
            groupList.push({
                cid: /containerid=([a-z0-9]+)/.exec(card.scheme)[1],
                title: card.title_sub,
                status: (card.buttons[0].name == "已签" ? 1 : 0),
            });
        });
        success(groupList);
    }, error => fail(error));
} 

function magic(setting = {
    taskName: "应用脚本",
}) {
    const IS_QUAN_X = typeof $task != "undefined";
    const IS_SURGE = typeof $httpClient != "undefined";
    const IS_REQUEST = typeof $request != "undefined";
    let responseAdapter = resp => {
        if (!resp) return;
        if (resp.status) resp.statusCode = resp.status;
        else if (resp.statusCode) resp.status = resp.statusCode;
        return resp;
    };
    let httpExecutor = (method, options, success, fail) => {
        options = typeof options == "string" ? {
            url: options
        } : options;
        if (IS_QUAN_X) {
            options.method = method;
            $task.fetch(options).then(resp => {
                resp = responseAdapter(resp);
                success(JSON.parse(resp.body), resp);
            }, reason => fail(reason.error));
        } else {
            $httpClient[method.toLowerCase()](options, (error, resp, data) => {
                resp = responseAdapter(resp);
                error ? fail(error) : success(JSON.parse(data), resp);
            });
        }
    };
    let utils =  {
        isSurge: () => IS_SURGE,
        isQuanX: () => IS_QUAN_X,
        done: (value = {}) => $done(value),
        log: msg => console.log(`[${setting.taskName}] ${msg}`),
        getData: key => IS_SURGE ? $persistentStore.read(key) : $prefs.valueForKey(key),
        setData: (key, val) => IS_SURGE ? $persistentStore.write(val, key) : $prefs.setValueForKey(val, key),
        notify: (subtitle, content) => utils.customNotify(setting.taskName, subtitle, content),
        customNotify: (title, subtitle, content) => IS_SURGE ? $notification.post(title, subtitle, content) : $notify(title, subtitle, content),
        httpGet: (options, success, fail) => httpExecutor("GET", options, success, fail),
        httpPost: (options, success, fail) => httpExecutor("POST", options, success, fail),
        dispatch: (task, request) => { 
            try {
                IS_REQUEST ? request() : task();
            } catch(error) {
                if (typeof setting.exceptionHandle === 'function') return setting.exceptionHandle(error);
                utils.notify("执行异常", error);
                utils.log(error);
            } finally {
                utils.done();
            }
        }
    }
    
    return utils;
}
