// ^https?:\/\/api\.weibo\.cn\/2/(cardlist|page\/button|page)\? url script-request-header weibo_checkin_x.js
// 40 5 0 * * * weibo_checkin_x.js, tag=超话签到, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/weibo.png, enabled=true

const TOKEN_KEY = "mob_weibo_sign_in_token";

let urlKey = {
    signIn: "signIn",
    followList: "followList",
    groupDetail: "groupDetail"
}

let utils = magic({
    taskName: "微博超话签到"
});

let tokenManager = {
    updateToken: (token) => {
        if (!token) throw "Token can not be null";
        let tokenMapStr = utils.getData(TOKEN_KEY);
        let tokenMap = tokenMapStr ? JSON.parse(tokenMapStr) : {};
        tokenMap[token.gsid] = token;
        utils.setData(TOKEN_KEY, JSON.stringify(tokenMap));
    },
    getToken: (gsid) => {
        let tokenMapStr = utils.getData(TOKEN_KEY);
        let tokenMap = tokenMapStr ? JSON.parse(tokenMapStr) : {};
        return tokenMap[gsid];
    },
    getTokens: () => {
        let tokenMapStr = utils.getData(TOKEN_KEY);
        let tokenMap = tokenMapStr ? JSON.parse(tokenMapStr) : {};
        let tokenList = [];
        for (let key in tokenMap) tokenList.push(tokenMap[key]);
        return tokenList;
    }
}

utils.dispatch(() => {
    let taskExecute = (tokens, idx) => {
        let token = tokens[idx];
        getFollowList(token, (groups) => {
            let resultCollector = {
                counter: 0,
                content: null,
                lines: groups.length,
                append: (line) => {
                    resultCollector.content = resultCollector.content ? `${resultCollector.content}\n${line}` : line;
                    if (++resultCollector.counter == resultCollector.lines) {
                        utils.notify("", resultCollector.content);
                        taskExecute(tokens, ++idx);
                    }
                }
            };
            groups.forEach(group => {
                let groupName = `【${group.title}】`;
                if (group.status == 1) return resultCollector.append(`🔴${groupName}签到失败，已经签到了～`);
                signIn(token[urlKey.signIn], group.cid, body => {
                    let line;
                    utils.log(groupName);
                    if (body.result == 1) line = `🟢${groupName}签到成功，${body.button.name}`;
                    else {
                        utils.log(JSON.stringify(body));
                        line = `🔴${groupName}签到失败，`;
                        if (body.result == 388000) line += `需要验证码`;
                        else if (body["error_msg"]) line += body["error_msg"];
                        else line = line += "发生未知错误，请通过日志排查问题";
                    }
                    resultCollector.append(line);
                }, error => resultCollector.append(`🔴${groupName}签到失败，${JSON.stringify(error)}`));
            });
        });
    }

    taskExecute(tokenManager.getTokens(), 0);
}, () => {
    let content; 
    let url = $request.url; 
    let tokenUpdater = (key, url) => {
        let gsid = url.match(/gsid=(.*?)&/)[1].replace("_", "");
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
    } else if (url.startsWith('https://api.weibo.cn/2/page?gsid=') && url.indexOf("need_head_cards") != -1) {
        tokenUpdater(urlKey.groupDetail, url.replace(/&fid=.+?&/, "&fid=CID&").replace(/&containerid=.+?&/, "&containerid=CID&"));
        content = "写入超话信息成功！";
    }
    if (content) utils.notify("", `✅ ${content}`);
});

function signIn(url, cid, success, fail) {
    try {
        utils.httpGet(url.replace(/CID/g, cid), body => {
            utils.log("SUCCESS " + url.replace(/CID/g, cid) + "\n" + JSON.stringify(body));
            success(body);
        }, error => {
            utils.log("ERROR " + url.replace(/CID/g, cid) + "\n" + JSON.stringify(error));
            fail(error);
        });
    } catch (e) {
        console.log(e);
    }
}

function getFollowList(token, callback) {
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
        callback(groupList);
    });
} 

function magic(setting = {
    taskName: "应用脚本",
}) {
    const IS_QUAN_X = typeof $task != "undefined";
    const IS_SURGE = typeof $httpClient != "undefined";
    const IS_REQUEST = typeof $request != "undefined";
    let responseAdapter = (resp) => {
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
            $task.fetch(options).then((resp) => {
                resp = responseAdapter(resp);
                success(JSON.parse(resp.body), resp);
            }, (reason) => fail(reason.error));
        } else {
            $httpClient[method.toLowerCase()](options, (error, resp) => {
                resp = responseAdapter(resp);
                error ? fail(error) : success(JSON.parse(resp.body), resp);
            });
        }
    };
    let utils =  {
        isSurge: () => IS_SURGE,
        isQuanX: () => IS_QUAN_X,
        done: (value = {}) => $done(value),
        log: (msg) => console.log(`[${setting.taskName}] ${msg}`),
        getData: (key) => IS_SURGE ? $persistentStore.read(key) : $prefs.valueForKey(key),
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
            } finally {
                utils.done();
            }
        }
    }
    
    return utils;
}
