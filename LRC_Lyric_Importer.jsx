/*
AE_LRC_Lyrics_Importer.jsx
LRC 歌词解析与自动排版脚本（ExtendScript / Adobe After Effects）
兼容 AE CC 2018 及以上
*/

(function thisScript_main() {
    var SCRIPT_NAME = "LRC 歌词导入器";

    var DEFAULT_FONT = "Arial";
    var DEFAULT_SIZE = 36;
    var DEFAULT_COLOR = [1, 1, 1]; // 白色 RGB(0..1)
    var DEFAULT_DURATION = 2.0; // 默认持续时间（秒）

    var parsedLines = []; // 存储解析后的歌词数据

    /**
     * 字符串去空格
     * @param {String} str 待处理字符串
     * @return {String} 去除首尾空格后的字符串
     */
    function trimStr(str) {
        if (typeof str !== "string") return "";
        return str.replace(/^\s+|\s+$/g, "");
    }

    /**
     * 格式化时间（秒 -> mm:ss.cc）
     * @param {Number} t 时间（秒）
     * @return {String} 格式化后的时间字符串
     */
    function formatTime(t) {
        if (isNaN(t) || t === Infinity) return "00:00.00";
        var total = Math.max(0, t);
        var mm = Math.floor(total / 60);
        var ss = Math.floor(total % 60);
        var cs = Math.round((total - Math.floor(total)) * 100);
        var mmStr = (mm < 10 ? "0" : "") + mm;
        var ssStr = (ss < 10 ? "0" : "") + ss;
        var csStr = (cs < 10 ? "0" : "") + cs;
        return mmStr + ":" + ssStr + "." + csStr;
    }

    /**
     * 解析LRC文件内容
     * @param {String} content LRC文件内容
     * @return {Array} 解析后的歌词数组（包含time和text属性）
     */
    function parseLRCContent(content) {
        var lines = content.split(/\r\n|\r|\n/); 
        var result = [];
        for (var i = 0; i < lines.length; i++) {
            var line = trimStr(lines[i]); 
            if (!line) continue; 

            // 匹配时间戳 [mm:ss.xx]
            var timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
            var match;
            var times = [];

            // 提取所有时间戳
            while ((match = timeRegex.exec(line)) !== null) {
                var mm = parseInt(match[1], 10);
                var ss = parseInt(match[2], 10);
                var ms = match[3] ? parseInt((match[3] + "00").substr(0, 3), 10) : 0; // 补全3位毫秒
                var seconds = mm * 60 + ss + ms / 1000;
                seconds = Math.round(seconds * 100) / 100; 
                times.push(seconds);
            }

            // 提取歌词文本（移除时间戳后）
            if (times.length > 0) {
                var text = trimStr(line.replace(timeRegex, "")); 
                // 为每个时间戳创建一条歌词记录
                for (var j = 0; j < times.length; j++) {
                    result.push({
                        time: times[j],
                        text: text,
                        lineIndex: i + 1 // 记录原行号，用于排序
                    });
                }
            }
        }

        // 按时间排序（时间相同则按原行号排序）
        result.sort(function (a, b) {
            if (a.time === b.time) return a.lineIndex - b.lineIndex;
            return a.time - b.time;
        });

        return result;
    }

    /**
     * RGB数组转十六进制整数（用于颜色选择器）
     * @param {Array} rgb RGB数组（0..1范围）
     * @return {Number} 十六进制整数
     */
    function rgbArrayToHexInt(rgb) {
        function clamp(v) {
            return Math.max(0, Math.min(255, Math.round(v * 255)));
        }
        var r = clamp(rgb[0]), g = clamp(rgb[1]), b = clamp(rgb[2]);
        return (r << 16) + (g << 8) + b;
    }

    /**
     * 十六进制整数转RGB数组
     * @param {Number} hexInt 十六进制整数
     * @return {Array} RGB数组（0..1范围）
     */
    function hexIntToRgbArray(hexInt) {
        var r = ((hexInt >> 16) & 255) / 255;
        var g = ((hexInt >> 8) & 255) / 255;
        var b = (hexInt & 255) / 255;
        return [r, g, b];
    }

    /**
     * RGB数组转十六进制字符串
     * @param {Array} rgb RGB数组（0..1范围）
     * @return {String} 十六进制字符串（如#ffffff）
     */
    function rgbArrayToHexString(rgb) {
        function clamp(v) { return Math.max(0, Math.min(255, Math.round(v * 255))); }
        var r = clamp(rgb[0]).toString(16); if (r.length < 2) r = "0" + r;
        var g = clamp(rgb[1]).toString(16); if (g.length < 2) g = "0" + g;
        var b = clamp(rgb[2]).toString(16); if (b.length < 2) b = "0" + b;
        return "#" + r + g + b;
    }

    /**
     * 显示提示框
     * @param {String} msg 消息内容
     * @param {String} title 标题
     */
    function showAlert(msg, title) {
        title = title || SCRIPT_NAME;
        alert(msg, title);
    }

    /**
     * 构建UI界面
     * @param {Object} thisObj 脚本上下文对象
     */
    function buildUI(thisObj) {
        // 创建窗口（面板或浮动窗口）
        var uiWin = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        uiWin.orientation = "column";
        uiWin.alignChildren = ["fill", "top"];
        uiWin.margins = 10;

        // 目标合成选择区域
        var compGroup = uiWin.add("group");
        compGroup.orientation = "row";
        compGroup.alignment = ["fill", "top"];
        compGroup.add("statictext", undefined, "目标合成：");
        var compLabel = compGroup.add("statictext", undefined, getActiveCompName());
        compLabel.characters = 30;
        var refreshBtn = compGroup.add("button", undefined, "刷新");
        refreshBtn.onClick = function () { compLabel.text = getActiveCompName(); };

        // 参数设置面板
        var settingsPanel = uiWin.add("panel", undefined, "参数设置");
        settingsPanel.orientation = "column";
        settingsPanel.alignChildren = ["fill", "top"];
        settingsPanel.margins = 10;

        // 字体设置
        var fontGroup = settingsPanel.add("group");
        fontGroup.orientation = "row";
        fontGroup.add("statictext", undefined, "字体:");
        var fontInput = fontGroup.add("edittext", undefined, DEFAULT_FONT);
        fontInput.characters = 20;

        // 字号设置
        var sizeGroup = settingsPanel.add("group");
        sizeGroup.orientation = "row";
        sizeGroup.add("statictext", undefined, "字号:");
        var sizeInput = sizeGroup.add("edittext", undefined, DEFAULT_SIZE.toString());
        sizeInput.characters = 6;

        // 颜色设置
        var colorGroup = settingsPanel.add("group");
        colorGroup.orientation = "row";
        colorGroup.add("statictext", undefined, "颜色:");
        // 使用panel作为颜色预览（兼容AE各版本）
        var colorPreview = colorGroup.add("panel", undefined, "");
        colorPreview.preferredSize = [30, 18];
        var currentColor = DEFAULT_COLOR.slice(); // 当前颜色
        try {
            colorPreview.graphics.backgroundColor = colorPreview.graphics.newBrush(
                colorPreview.graphics.BrushType.SOLID_COLOR, 
                currentColor
            );
        } catch (e) {
            // 回退方案：显示十六进制颜色
            try { colorPreview.text = rgbArrayToHexString(currentColor); } catch (ee) {}
        }
        var colorBtn = colorGroup.add("button", undefined, "选择颜色");

        // 持续时间设置
        var durationGroup = settingsPanel.add("group");
        durationGroup.orientation = "row";
        durationGroup.add("statictext", undefined, "歌词持续时间(秒):");
        var durationInput = durationGroup.add("edittext", undefined, DEFAULT_DURATION.toString());
        durationInput.characters = 6;
        var autoMatchCheckbox = durationGroup.add("checkbox", undefined, "自动匹配下一句入点");
        autoMatchCheckbox.value = true;

        // 自动隐藏前一句设置
        var autoHideGroup = settingsPanel.add("group");
        autoHideGroup.orientation = "row";
        var autoHideCheckbox = autoHideGroup.add("checkbox", undefined, "自动隐藏/结束前一句（避免叠加）");
        autoHideCheckbox.value = true;

        settingsPanel.add("statictext", undefined, ""); // 空白分隔

        settingsPanel.add("statictext", undefined, "开源脚本，知识是免费！"); 

        // 导入区域
        var importGroup = uiWin.add("group");
        importGroup.orientation = "row";
        importGroup.alignChildren = ["left", "top"];
        var importBtn = importGroup.add("button", undefined, "导入 LRC 文件");
        var parseInfo = importGroup.add("statictext", undefined, "未导入歌词");
        parseInfo.characters = 40;

        // 操作按钮区域
        var actionGroup = uiWin.add("group");
        actionGroup.orientation = "row";
        actionGroup.alignment = ["fill", "top"];
        var generateBtn = actionGroup.add("button", undefined, "生成歌词层");
        var batchAdjustBtn = actionGroup.add("button", undefined, "批量调整持续时间");
        var selectGroupBtn = actionGroup.add("button", undefined, "选中歌词组");

        // 初始禁用按钮
        generateBtn.enabled = false;
        batchAdjustBtn.enabled = false;
        selectGroupBtn.enabled = false;

        // 颜色选择按钮事件
        colorBtn.onClick = function () {
            try {
                var hex = $.colorPicker(rgbArrayToHexInt(currentColor));
                if (hex !== undefined) {
                    currentColor = hexIntToRgbArray(hex);
                    try {
                        colorPreview.graphics.backgroundColor = colorPreview.graphics.newBrush(
                            colorPreview.graphics.BrushType.SOLID_COLOR, 
                            currentColor
                        );
                        colorPreview.text = "";
                    } catch (e) {
                        // 回退显示十六进制
                        try { colorPreview.text = rgbArrayToHexString(currentColor); } catch (ee) {}
                    }
                }
            } catch (e) {
                showAlert("颜色选择器不可用： " + e.message, "颜色选择错误");
            }
        };

        importBtn.onClick = function () {
            var lrcFile = File.openDialog("选择 LRC 文件", "*.lrc;*.txt");
            if (!lrcFile) return; 

            // 验证文件存在性
            if (!lrcFile.exists) {
                showAlert("所选文件不存在：\n" + lrcFile.fsName);
                return;
            }

            var content;
            try {
                lrcFile.encoding = "UTF-8";
                lrcFile.open("r");
                content = lrcFile.read();
                lrcFile.close();

                if (!content || trimStr(content) === "") {
                    lrcFile.encoding = ""; // 使用系统默认编码
                    lrcFile.open("r");
                    content = lrcFile.read();
                    lrcFile.close();
                }
            } catch (e) {
                showAlert("读取文件失败:\n" + e.message + "\n文件路径: " + lrcFile.fsName);
                return;
            }

            if (!content || trimStr(content) === "") {
                showAlert("文件内容为空或无法解析，请检查文件是否损坏。");
                parseInfo.text = "解析失败：文件为空或损坏";
                generateBtn.enabled = false;
                batchAdjustBtn.enabled = false;
                return;
            }

            // 解析LRC内容
            try {
                var parsed = parseLRCContent(content);
                if (!parsed || parsed.length === 0) {
                    showAlert(
                        "未检测到有效LRC时间戳，请检查格式。\n" +
                        "正确格式示例：[01:23.45]歌词内容\n" +
                        "注意：时间戳需包含在[]中，格式为mm:ss.xx", 
                        "解析失败"
                    );
                    parseInfo.text = "解析失败：无有效时间戳";
                    generateBtn.enabled = false;
                    batchAdjustBtn.enabled = false;
                    return;
                }

                // 存储解析结果并更新UI
                parsedLines = parsed;
                var minT = parsed[0].time;
                var maxT = parsed[parsed.length - 1].time;
                var summary = "成功解析 " + parsed.length + " 句歌词，时间范围 " + 
                            formatTime(minT) + " - " + formatTime(maxT);
                parseInfo.text = summary;
                generateBtn.enabled = true;
                batchAdjustBtn.enabled = true;
                showAlert(summary, "解析完成");
            } catch (e) {
                showAlert("解析歌词时出错:\n" + e.message, "解析错误");
                parseInfo.text = "解析失败：格式错误";
                generateBtn.enabled = false;
                batchAdjustBtn.enabled = false;
            }
        };

        // 生成歌词层按钮事件
        generateBtn.onClick = function () {
            if (!parsedLines || parsedLines.length === 0) {
                showAlert("请先导入并解析 LRC 文件。");
                return;
            }

            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) {
                showAlert("请先创建或打开合成。", "未检测到合成");
                return;
            }

            // 获取用户设置的参数
            var fontName = fontInput.text || DEFAULT_FONT;
            var fontSize = parseFloat(sizeInput.text) || DEFAULT_SIZE;
            var durationValue = parseFloat(durationInput.text);
            if (isNaN(durationValue) || durationValue <= 0) durationValue = DEFAULT_DURATION;
            var autoMatch = autoMatchCheckbox.value;
            var autoHide = autoHideCheckbox.value;
            var textColor = currentColor.slice();

            // 显示确认信息
            var minT = parsedLines[0].time;
            var maxT = parsedLines[parsedLines.length - 1].time;
            var confirmMsg = 
                "将在合成 \"" + comp.name + "\" 中生成 " + parsedLines.length + " 个文本层。\n" +
                "时间范围：" + formatTime(minT) + " - " + formatTime(maxT) + "\n" +
                "字体：" + fontName + "，字号：" + fontSize + "\n" +
                "持续时间：" + (autoMatch ? "自动匹配下一句入点" : durationValue + " 秒") + "\n\n" +
                "是否继续？";
            if (!confirm(confirmMsg)) {
                return;
            }

            // 开始生成歌词层（记录撤销组）
            app.beginUndoGroup(SCRIPT_NAME + " - 生成歌词层");

            // 创建歌词组（Null层）
            var groupNull;
            try {
                groupNull = comp.layers.addNull(0.01); // 持续时间0.01秒的Null层
                groupNull.name = "歌词图层组";
                groupNull.guideLayer = true; // 设为参考层（不渲染）
                groupNull.property("Transform").property("Position").setValue([10, 10]); // 移到角落
            } catch (e) {
                groupNull = null;
            }

            var createdLayers = [];

            // 生成每个歌词层
            for (var i = 0; i < parsedLines.length; i++) {
                var entry = parsedLines[i];
                var t = entry.time;
                var text = entry.text || ""; 
                var layerName = "歌词-" + text;

                // 创建文本层
                var txtLayer = comp.layers.addText(text);
                txtLayer.name = layerName;

                // 绑定到组
                if (groupNull) {
                    try { txtLayer.parent = groupNull; } catch (e) {}
                }

                // 设置文本样式
                var textProp = txtLayer.property("Source Text");
                var textDoc = textProp.value;
                textDoc.font = fontName;
                textDoc.fontSize = fontSize;
                textDoc.fillColor = textColor;
                textDoc.justification = ParagraphJustification.CENTER_JUSTIFY; // 居中对齐
                textDoc.applyFill = true;
                textDoc.applyStroke = false;
                textProp.setValue(textDoc);

                // 居中显示
                try {
                    txtLayer.property("Transform").property("Position").setValue([
                        comp.width / 2, 
                        comp.height / 2
                    ]);
                } catch (e) {}

                // 设置时间点
                try {
                    txtLayer.inPoint = t; // 入点
                    var outT;
                    if (autoMatch) {
                        // 自动匹配下一句入点
                        if (i + 1 < parsedLines.length) {
                            var nextT = parsedLines[i + 1].time;
                            outT = Math.max(t + 0.01, nextT); // 确保至少0.01秒
                        } else {
                            outT = t + durationValue; // 最后一句用默认时长
                        }
                    } else {
                        outT = t + durationValue; // 自定义时长
                    }
                    txtLayer.outPoint = outT;
                } catch (e) {
                    try {
                        txtLayer.startTime = t;
                        txtLayer.outPoint = t + (autoMatch && i + 1 < parsedLines.length 
                            ? Math.max(0.01, parsedLines[i + 1].time - t) 
                            : durationValue);
                    } catch (err2) {}
                }

                // 自动隐藏前一句
                if (autoHide && createdLayers.length > 0) {
                    try {
                        var prevLayer = createdLayers[createdLayers.length - 1];
                        prevLayer.outPoint = t; // 前一句在当前句入点时结束
                    } catch (e) {}
                }

                // 标记颜色（方便识别）
                try { txtLayer.label = 10; } catch (e) {}

                createdLayers.push(txtLayer);
            }

            // 选中歌词组
            try {
                if (groupNull) comp.selectedLayers = [groupNull];
            } catch (e) {}

            app.endUndoGroup();

            showAlert("歌词生成完成，共创建 " + createdLayers.length + " 个文本层。\n已将图层归类到“歌词图层组”。", "完成");
        };

        // 批量调整持续时间按钮事件
        batchAdjustBtn.onClick = function () {
            if (!parsedLines || parsedLines.length === 0) {
                showAlert("请先导入并解析 LRC 文件。");
                return;
            }

            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) {
                showAlert("请先创建或打开合成。", "未检测到合成");
                return;
            }

            // 查找当前合成中的歌词层
            var lyricLayers = [];
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                if (layer && /^歌词-\d+/.test(layer.name)) {
                    lyricLayers.push(layer);
                }
            }

            if (lyricLayers.length === 0) {
                showAlert("当前合成中未找到歌词层（名称格式应为“歌词-数字”）。");
                return;
            }

            // 获取新的持续时间
            var res = prompt("请输入新的持续时间（秒）：\n输入0则自动匹配下一句入点", "2");
            if (res === null) return; // 用户取消
            var newDur = parseFloat(res);
            if (isNaN(newDur)) {
                showAlert("请输入有效的数字。");
                return;
            }

            // 批量调整
            app.beginUndoGroup(SCRIPT_NAME + " - 批量调整歌词持续时间");
            var startTimesByName = {};
            for (var j = 0; j < parsedLines.length; j++) {
                var name = "歌词-" + (j + 1);
                startTimesByName[name] = parsedLines[j].time;
            }

            for (var k = 0; k < lyricLayers.length; k++) {
                var lyr = lyricLayers[k];
                var lyrName = lyr.name;
                var startTime = startTimesByName[lyrName] || lyr.inPoint;

                try {
                    lyr.inPoint = startTime;
                    if (newDur === 0) {
                        // 自动匹配下一句
                        var idx = parseInt(lyrName.split("-")[1], 10) - 1;
                        if (idx + 1 < parsedLines.length) {
                            lyr.outPoint = parsedLines[idx + 1].time;
                        } else {
                            lyr.outPoint = startTime + DEFAULT_DURATION;
                        }
                    } else {
                        // 自定义时长
                        lyr.outPoint = startTime + newDur;
                    }
                } catch (e) {
                    showAlert("调整图层“" + lyrName + "”时出错：" + e.message);
                }
            }

            app.endUndoGroup();
            showAlert("已完成 " + lyricLayers.length + " 个歌词层的持续时间调整。");
        };

        // 选中歌词组按钮事件
        selectGroupBtn.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) {
                showAlert("请先创建或打开合成。", "未检测到合成");
                return;
            }

            // 查找歌词组
            var groupLayer = null;
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                if (layer && layer.name === "歌词图层组") {
                    groupLayer = layer;
                    break;
                }
            }

            if (groupLayer) {
                comp.selectedLayers = [groupLayer];
                showAlert("已选中“歌词图层组”。");
            } else {
                showAlert("未找到“歌词图层组”，请先生成歌词层。");
            }
        };

        /**
         * 获取当前激活的合成名称
         * @return {String} 合成名称或提示文本
         */
        function getActiveCompName() {
            var activeItem = app.project.activeItem;
            if (activeItem && activeItem instanceof CompItem) {
                return activeItem.name;
            } else {
                return "未选择合成";
            }
        }

        // 显示窗口
        if (uiWin instanceof Window) {
            uiWin.center();
            uiWin.show();
        } else {
            uiWin.layout.layout(true);
            uiWin.layout.resize();
        }
    }

    try {
        buildUI(this);
    } catch (err) {
        showAlert("脚本运行异常：" + err.message + "\n" + err.stack);
    }

})();