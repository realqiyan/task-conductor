window.__ModuleLoader__.load({
  id: "task-conductor-plugin",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const API = "/task-conductor/api";
    const stored = { token: "" };
    const providers = [["", "providerNone"], ["openai", "OpenAI"], ["anthropic", "Anthropic"],
      ["deepseek", "DeepSeek"], ["openai-compatible", "providerCompatible"]];
    const credentialEnv = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", deepseek: "DEEPSEEK_API_KEY" };
    const statusTones = {
      active: "good", paused: "warn", completed: "neutral", expired: "neutral", cancelled: "neutral",
      running: "info", succeeded: "good", failed: "bad", interrupted: "bad", skipped: "neutral",
      timed_out: "bad", waiting_input: "warn", pending: "neutral", awaiting_review: "warn",
      stale: "warn", blocked: "bad", missing: "neutral", disabled: "neutral", installing: "info",
      ready: "good", error: "bad",
    };

    const messages = {
      zh: {
        nav: "任务控制台",
        title: "Task Conductor",
        subtitle: "查看任务、执行端与后台服务配置。",
        connected: "已连接",
        checking: "正在连接…",
        disconnected: "未连接",
        connectTitle: "连接本机控制台",
        connectHint: "dsh 通过本机服务代理管理请求。使用独立管理员令牌，MCP 令牌不能登录。",
        tokenLabel: "管理员令牌",
        tokenPlaceholder: "输入管理员令牌",
        tokenHelp: "在终端运行 task-conductor console token 获取。",
        tokenHint: "勾选“记住”后保存在本机 dsh 凭据中，刷新页面自动连接。",
        rememberToken: "记住管理员令牌",
        rememberHint: "保存在本机 dsh 凭据；断开连接时清除。",
        tokenSaved: "令牌已保存",
        savedTokenHint: "已保存管理员令牌；服务恢复后刷新页面会自动连接。",
        connect: "连接",
        connecting: "连接中…",
        disconnect: "断开",
        tokenInvalid: "管理员令牌无效，请重新连接。",
        tokenExpired: "管理员令牌已失效，请重新连接。",
        refresh: "刷新",
        retry: "重试",
        loading: "正在加载…",
        cancel: "返回",
        confirm: "确认",
        back: "返回",
        tasks: "任务",
        executors: "执行端",
        settings: "设置",
        notConfigured: "未配置",
        none: "无",
        serviceRunning: "服务运行中",
        serviceUnavailable: "服务不可用",
        activeRuns: "活动协调 {runs} · ACP 会话 {sessions}",
        pendingRestart: "有变更待重启",
        listTitle: "任务列表",
        listHint: "查看执行进度、交付与未来触发。",
        emptyTitle: "还没有任务",
        emptyHint: "在已连接的 MCP 客户端中创建任务，提交后会出现在这里。",
        pageInfo: "第 {page} 页 · 本页 {count} 条",
        previous: "上一页",
        nextPage: "下一页",
        scheduleNow: "立即执行 · 单次",
        scheduleOnce: "定时执行 · {time}",
        scheduleCron: "周期执行 · {expression} · {timezone}",
        noFuture: "无后续计划",
        plannedAt: "原计划 {time}",
        paused: "已暂停",
        runHistory: "运行历史",
        noRuns: "尚未开始运行",
        noRunsHint: "任务触发后，可在这里查看进度与结果。",
        prompt: "整体目标",
        nodes: "节点计划",
        nodesHint: "执行端与依赖在任务创建时固定。只有已验收交付才能解锁下游节点。",
        node: "节点",
        executor: "执行端",
        dependsOn: "前置节点",
        nodeDetail: "节点与会话详情",
        runDetail: "运行详情",
        runOverview: "运行概况",
        startTime: "开始时间",
        endTime: "结束时间",
        acceptedNodes: "已验收节点",
        summary: "运行总结",
        questions: "问题与回复",
        questionsHint: "请在发起任务的 MCP 客户端中回答问题。",
        replied: "已回复",
        expired: "已过期",
        unanswered: "未回复",
        waitingAnswer: "待回答",
        questionNode: "节点：{node} · 回答期限：{time}",
        acceptedDelivery: "已验收交付",
        acceptance: "验收理由",
        noDelivery: "尚无已验收交付。",
        turns: "原始回合",
        turn: "回合 {index}",
        taskMetadata: "任务与执行端详情",
        runMetadata: "运行详情数据",
        editConfig: "编辑基础配置",
        taskName: "任务名称",
        scheduleType: "触发方式",
        keepNow: "保留立即执行",
        scheduleOnceType: "单次定时",
        scheduleCronType: "Cron 周期",
        triggerAt: "触发时间",
        triggerAtHint: "ISO 8601 时间，须带时区，例如 2026-12-01T09:00:00+08:00。",
        cronExpression: "Cron 表达式",
        timezone: "时区",
        saveTask: "保存任务配置",
        taskEditHint: "新计划只影响未来触发；暂停状态保持不变。",
        close: "关闭",
        noChanges: "配置没有变化。",
        taskSaved: "任务配置已保存。",
        pause: "暂停触发",
        resume: "恢复触发",
        pauseTitle: "暂停触发？",
        resumeTitle: "恢复触发？",
        pauseMessage: "暂停后不再开始新的计划运行，当前运行会继续。",
        resumeMessage: "恢复后按计划触发，不补跑已错过的时间。",
        scheduleUpdated: "触发计划已更新。",
        triggerPlan: "触发计划",
        executionMode: "执行方式",
        nextTrigger: "下次触发",
        workspace: "工作目录",
        executorTitle: "执行端",
        executorHint: "连接本机 Agent，查看启动依赖与准备状态。",
        refreshExecutors: "重新检测",
        detected: "检测已完成，缺少的适配器将在后台准备。",
        launchPath: "启动路径",
        adapter: "ACP 适配器",
        nativeSupport: "原生支持",
        customProgram: "自定义程序",
        adapterPending: "尚未准备",
        launchingCwd: "启动目录：{cwd}",
        installHint: "安装原生 CLI 并完成登录后，重新检测。",
        disabledHint: "在设置的高级选项中启用，重启后生效。",
        updateAdapter: "更新适配器",
        updateTitle: "更新 {name} 适配器？",
        updateMessage: "准备期间暂停向此执行端派发新工作，活动进程不受影响。",
        startUpdate: "开始更新",
        updateStarted: "适配器更新已开始。完成后将自动更新状态。",
        nativeUpdate: "通过原生 CLI 更新",
        unregister: "注销执行端",
        unregisterTitle: "注销 {id}？",
        unregisterMessage: "立即阻止新的派发。活动进程继续运行，已有任务与历史保留。",
        unregistered: "执行端已注销。",
        registerExecutor: "注册自定义执行端",
        registerHint: "授权本机程序作为执行端，保存后立即生效。认证与无人值守权限请先通过原生工具配置。",
        register: "注册执行端",
        registerConfirmTitle: "注册 {id}？",
        registerConfirmMessage: "允许服务在后续任务中启动此本机程序。注册不验证 ACP 协议、模型认证或工具权限。",
        registerConfirm: "确认注册",
        registered: "执行端已注册并生效。",
        executorId: "执行端 ID",
        executorIdHint: "不能与已有执行端重复。",
        command: "可执行文件",
        commandHint: "本机 stdio ACP 程序的绝对路径。",
        args: "启动参数",
        argsHint: "JSON 字符串数组，例如 [\"--stdio\"]；不要填写凭据。",
        cwdLabel: "启动目录",
        cwdHint: "可选。留空使用任务工作目录。",
        argsInvalid: "启动参数须为 JSON 字符串数组。",
        executorNote: "就绪表示启动依赖已准备。模型认证与工具权限由执行端的原生配置管理。",
        settingsTitle: "设置",
        settingsHint: "管理协调模型、密钥与服务启动配置。",
        coordinator: "协调模型",
        coordinatorHint: "负责推进任务、处理澄清与验收交付。",
        provider: "模型提供方",
        providerNone: "暂不配置",
        providerCompatible: "OpenAI 兼容接口",
        model: "模型 ID",
        modelPlaceholder: "例如 deepseek-flash",
        compatible: "接口能力",
        baseUrl: "接口地址",
        baseUrlHint: "不含凭据、查询参数或片段。",
        apiKeyEnv: "密钥引用",
        api: "接口协议",
        apiCompletions: "Chat Completions",
        apiResponses: "Responses",
        contextWindow: "上下文窗口",
        maxTokens: "最大输出 token",
        reasoning: "支持推理",
        credentialRef: "密钥引用：{key}。请先在模型密钥中保存对应凭据。",
        noModelHint: "未配置模型时，服务仅提供管理功能。",
        advanced: "高级设置",
        dataDir: "数据目录",
        dataDirHint: "使用绝对路径；切换目录不搬迁或删除旧历史。",
        port: "监听端口",
        portHint: "0 表示自动分配。",
        autoPort: "自动分配",
        tokenEnv: "MCP 令牌变量名",
        tokenEnvHint: "修改名称会保留令牌值。",
        builtInExecutors: "启用内置执行端",
        restartNote: "重启后生效，已有任务不会自动改派。",
        preview: "预览变更",
        previewTitle: "确认配置变更",
        noPreviewChanges: "没有新的配置变更",
        sameAsSaved: "当前编辑与已保存配置一致。",
        field: "配置项",
        savedValue: "已保存",
        newValue: "将保存",
        affectedTasks: "受影响任务",
        affectedHint: "执行端变更可能阻止这些任务继续派发，已有指派不会自动调整。",
        localValid: "本地校验通过。保存后须重启生效；校验不验证模型认证或实际执行。",
        saveConfig: "确认保存",
        backToEdit: "返回编辑",
        configSaved: "配置已保存，重启后生效。",
        configEffective: "配置已生效",
        configPending: "已保存 · 待重启",
        writeBlocked: "上次保存结果未确认。请停服核查配置文件，当前禁止保存与重启。",
        credentials: "模型密钥",
        credentialsHint: "先保存密钥，再保存引用它的模型配置。服务与管理员令牌不在这里修改。",
        credentialKey: "密钥变量名",
        credentialKeyHint: "新名称须以 _KEY、_TOKEN、_SECRET 或 _PASSWORD 结尾。",
        credentialValue: "密钥值",
        credentialValueHint: "原值不回显，未提交时保留原值。",
        saveCredential: "保存密钥",
        savedBadge: "已设置",
        unsetBadge: "未设置",
        runningBadge: "待重启",
        replace: "替换",
        set: "设置",
        delete: "删除",
        inUse: "使用中",
        credentialSaved: "密钥已保存，重启后生效。",
        credentialDeleted: "密钥已删除，重启后生效。",
        deleteTitle: "删除此密钥？",
        deleteMessage: "{key} 的已保存值将被删除。当前进程保留原值，直到重启。",
        serviceRestart: "服务与重启",
        serviceHint: "重启应用已保存的配置与密钥，并检查新实例是否可用。",
        currentModel: "当前模型",
        currentDataDir: "当前数据目录",
        listeningPort: "监听端口",
        runningConfig: "当前运行配置",
        restart: "重启服务",
        restartHint: "活动执行可能中断",
        restartConfirmTitle: "使用已保存配置重启？",
        restartConfirmMessage: "当前活动协调 {runs} 个，ACP 会话 {sessions} 个。重启会关闭会话，活动执行及待回答运行可能中断。未保存编辑将丢失，旧数据不会迁移。",
        restartConfirm: "确认重启",
        restarting: "正在重启并检查服务，请稍候…",
        restartConfirmed: "重启成功。正在重新连接…",
        restartFailed: "重启结果未确认，请运行 task-conductor status 核对。",
        savePending: "正在保存，请稍候。",
        noCredentials: "当前没有可编辑的模型密钥。",
        statusActive: "已启用",
        statusPaused: "已暂停",
        statusCompleted: "触发结束",
        statusExpired: "已到期",
        statusCancelled: "已取消",
        statusRunning: "运行中",
        statusSucceeded: "已完成",
        statusFailed: "失败",
        statusInterrupted: "已中断",
        statusSkipped: "已跳过",
        statusTimedOut: "已超时",
        statusWaitingInput: "待回答",
        statusPending: "待执行",
        statusAwaitingReview: "待验收",
        statusStale: "待复核",
        statusBlocked: "已阻塞",
        statusMissing: "未安装",
        statusDisabled: "已禁用",
        statusInstalling: "准备中",
        statusReady: "已就绪",
        statusError: "准备失败",
        currentProcess: "当前进程",
        unknownError: "请求被拒绝，请检查服务状态。",
        configurationChanged: "配置已被修改或编辑已过期，请保留草稿后刷新。",
        uncertainOutcomes: "任务存在结果不明的执行，无法恢复未来触发。",
        noFutureSchedule: "任务已无未来触发，请刷新核对。",
        missingCredential: "缺少模型密钥，请先保存对应凭据。",
        endpointCredential: "更换模型端点时须使用新的密钥引用，请先保存新密钥。",
        credentialReferenced: "已保存配置仍在使用此密钥，请先修改配置。",
        localValidation: "本地校验失败：请检查数据目录、执行端选择和凭据隔离。",
        configUnreadable: "无法读取私有配置文件；请离线检查格式、所有权和权限。",
        publicationUncertain: "保存结果未确认；请停服检查配置文件后再保存。",
        timeoutError: "操作超时，请稍后重试。",
        unreachableError: "无法连接 Task Conductor 服务，请确认服务状态后重试。",
        responseError: "无法读取服务响应，请刷新重试。",
        operationUnconfirmed: "操作结果未确认，请刷新核对后再操作。",
        restartUnknown: "重启结果未确认，请运行 task-conductor status 核对。",
      },
      en: {
        nav: "Task Conductor",
        title: "Task Conductor",
        subtitle: "Inspect tasks, executors, and the local service.",
        connected: "Connected",
        checking: "Connecting…",
        disconnected: "Not connected",
        connectTitle: "Connect to the local console",
        connectHint: "dsh proxies administrator requests. Use the administrator token; the MCP token cannot sign in.",
        tokenLabel: "Administrator token",
        tokenPlaceholder: "Enter administrator token",
        tokenHelp: "Run task-conductor console token in a terminal.",
        tokenHint: "Remembered tokens are stored in local dsh credentials and reconnect after refresh.",
        rememberToken: "Remember administrator token",
        rememberHint: "Stored in local dsh credentials; disconnect clears it.",
        tokenSaved: "Token saved",
        savedTokenHint: "An administrator token is saved; refreshing after the service recovers reconnects automatically.",
        connect: "Connect",
        connecting: "Connecting…",
        disconnect: "Disconnect",
        tokenInvalid: "The administrator token is invalid. Connect again.",
        tokenExpired: "The administrator token expired. Connect again.",
        refresh: "Refresh",
        retry: "Retry",
        loading: "Loading…",
        cancel: "Back",
        confirm: "Confirm",
        back: "Back",
        tasks: "Tasks",
        executors: "Executors",
        settings: "Settings",
        notConfigured: "Not configured",
        none: "None",
        serviceRunning: "Service running",
        serviceUnavailable: "Service unavailable",
        activeRuns: "Active runs {runs} · ACP sessions {sessions}",
        pendingRestart: "Changes pending restart",
        listTitle: "Tasks",
        listHint: "Inspect progress, deliveries, and future triggers.",
        emptyTitle: "No tasks yet",
        emptyHint: "Create a task from a connected MCP client; it appears here after submission.",
        pageInfo: "Page {page} · {count} items",
        previous: "Previous",
        nextPage: "Next",
        scheduleNow: "Immediate · once",
        scheduleOnce: "Scheduled · {time}",
        scheduleCron: "Recurring · {expression} · {timezone}",
        noFuture: "No future trigger",
        plannedAt: "Originally {time}",
        paused: "Paused",
        runHistory: "Run history",
        noRuns: "No runs yet",
        noRunsHint: "Progress and results appear here after the task triggers.",
        prompt: "Objective",
        nodes: "Node plan",
        nodesHint: "Executors and dependencies are fixed at creation. Only accepted deliveries unlock downstream nodes.",
        node: "Node",
        executor: "Executor",
        dependsOn: "Depends on",
        nodeDetail: "Node and session details",
        runDetail: "Run detail",
        runOverview: "Run overview",
        startTime: "Started",
        endTime: "Finished",
        acceptedNodes: "Accepted nodes",
        summary: "Summary",
        questions: "Questions and replies",
        questionsHint: "Answer questions from the MCP client that submitted the task.",
        replied: "Replied",
        expired: "Expired",
        unanswered: "Unanswered",
        waitingAnswer: "Awaiting answer",
        questionNode: "Node: {node} · Answer by {time}",
        acceptedDelivery: "Accepted delivery",
        acceptance: "Acceptance reason",
        noDelivery: "No accepted delivery yet.",
        turns: "Raw turns",
        turn: "Turn {index}",
        taskMetadata: "Task and executor details",
        runMetadata: "Run data",
        editConfig: "Edit basic configuration",
        taskName: "Task name",
        scheduleType: "Trigger",
        keepNow: "Keep immediate",
        scheduleOnceType: "One-time schedule",
        scheduleCronType: "Cron schedule",
        triggerAt: "Trigger time",
        triggerAtHint: "ISO 8601 with a time zone, for example 2026-12-01T09:00:00+08:00.",
        cronExpression: "Cron expression",
        timezone: "Time zone",
        saveTask: "Save task configuration",
        taskEditHint: "New schedules affect future triggers only; pause state is unchanged.",
        close: "Close",
        noChanges: "No configuration changes.",
        taskSaved: "Task configuration saved.",
        pause: "Pause triggers",
        resume: "Resume triggers",
        pauseTitle: "Pause triggers?",
        resumeTitle: "Resume triggers?",
        pauseMessage: "No new scheduled run starts while paused; the current run continues.",
        resumeMessage: "Triggers follow the schedule again; missed times are not replayed.",
        scheduleUpdated: "Trigger plan updated.",
        triggerPlan: "Trigger plan",
        executionMode: "Mode",
        nextTrigger: "Next trigger",
        workspace: "Workspace",
        executorTitle: "Executors",
        executorHint: "Connect local agents and inspect launch prerequisites.",
        refreshExecutors: "Detect again",
        detected: "Detection finished. Missing adapters prepare in the background.",
        launchPath: "Launch path",
        adapter: "ACP adapter",
        nativeSupport: "Native support",
        customProgram: "Custom program",
        adapterPending: "Not prepared",
        launchingCwd: "Launch directory: {cwd}",
        installHint: "Install the native CLI and sign in, then detect again.",
        disabledHint: "Enable it under advanced settings; takes effect after restart.",
        updateAdapter: "Update adapter",
        updateTitle: "Update the {name} adapter?",
        updateMessage: "New dispatch to this executor pauses while preparing; active processes are unaffected.",
        startUpdate: "Start update",
        updateStarted: "Adapter update started. Status refreshes automatically.",
        nativeUpdate: "Update through the native CLI",
        unregister: "Unregister executor",
        unregisterTitle: "Unregister {id}?",
        unregisterMessage: "New dispatch stops immediately. Active processes continue; tasks and history remain.",
        unregistered: "Executor unregistered.",
        registerExecutor: "Register a custom executor",
        registerHint: "Authorize a local program as an executor; takes effect on save. Prepare authentication and unattended permissions with native tools first.",
        register: "Register executor",
        registerConfirmTitle: "Register {id}?",
        registerConfirmMessage: "Allow the service to launch this local program for future tasks. Registration does not verify ACP, model authentication, or tool permissions.",
        registerConfirm: "Register",
        registered: "Executor registered and active.",
        executorId: "Executor ID",
        executorIdHint: "Must not duplicate an existing executor.",
        command: "Executable",
        commandHint: "Absolute path to a local stdio ACP program.",
        args: "Arguments",
        argsHint: "JSON string array, for example [\"--stdio\"]; never include credentials.",
        cwdLabel: "Launch directory",
        cwdHint: "Optional. Empty uses the task workspace.",
        argsInvalid: "Arguments must be a JSON string array.",
        executorNote: "Ready means launch prerequisites are prepared. Model authentication and tool permissions follow the executor's native configuration.",
        settingsTitle: "Settings",
        settingsHint: "Manage the coordinator model, credentials, and service startup configuration.",
        coordinator: "Coordinator model",
        coordinatorHint: "Advances tasks, handles clarification, and accepts deliveries.",
        provider: "Provider",
        providerNone: "Not configured",
        providerCompatible: "OpenAI-compatible",
        model: "Model ID",
        modelPlaceholder: "For example deepseek-flash",
        compatible: "Endpoint capabilities",
        baseUrl: "Base URL",
        baseUrlHint: "No credentials, query parameters, or fragments.",
        apiKeyEnv: "Credential reference",
        api: "API protocol",
        apiCompletions: "Chat Completions",
        apiResponses: "Responses",
        contextWindow: "Context window",
        maxTokens: "Maximum output tokens",
        reasoning: "Supports reasoning",
        credentialRef: "Credential: {key}. Save the matching model key first.",
        noModelHint: "Without a model, the service provides management only.",
        advanced: "Advanced settings",
        dataDir: "Data directory",
        dataDirHint: "Use an absolute path; switching does not move or delete history.",
        port: "Listening port",
        portHint: "0 selects an automatic port.",
        autoPort: "Automatic",
        tokenEnv: "MCP token variable",
        tokenEnvHint: "Renaming preserves the token value.",
        builtInExecutors: "Enable built-in executors",
        restartNote: "Takes effect after restart; existing tasks are not reassigned.",
        preview: "Preview changes",
        previewTitle: "Confirm configuration changes",
        noPreviewChanges: "No new configuration changes",
        sameAsSaved: "The current edit matches the saved configuration.",
        field: "Field",
        savedValue: "Saved",
        newValue: "New",
        affectedTasks: "Affected tasks",
        affectedHint: "Executor changes may block new dispatch for these tasks; existing assignments are not adjusted.",
        localValid: "Local validation passed. Save then restart; validation does not verify model authentication or execution.",
        saveConfig: "Save changes",
        backToEdit: "Back to edit",
        configSaved: "Configuration saved; takes effect after restart.",
        configEffective: "Configuration active",
        configPending: "Saved · restart pending",
        writeBlocked: "The previous save is unconfirmed. Stop the service and inspect the configuration files; saving and restart are disabled.",
        credentials: "Model credentials",
        credentialsHint: "Save keys before the model configuration that references them. Service and administrator tokens are not edited here.",
        credentialKey: "Variable name",
        credentialKeyHint: "Names must end with _KEY, _TOKEN, _SECRET, or _PASSWORD.",
        credentialValue: "Secret value",
        credentialValueHint: "Values are never shown; leaving it empty keeps the current value.",
        saveCredential: "Save secret",
        savedBadge: "Saved",
        unsetBadge: "Not set",
        runningBadge: "Restart pending",
        replace: "Replace",
        set: "Set",
        delete: "Delete",
        inUse: "In use",
        credentialSaved: "Secret saved; takes effect after restart.",
        credentialDeleted: "Secret deleted; takes effect after restart.",
        deleteTitle: "Delete this secret?",
        deleteMessage: "The saved value of {key} is removed. The running process keeps the old value until restart.",
        serviceRestart: "Service and restart",
        serviceHint: "Restart with the saved configuration and credentials, then check the new instance.",
        currentModel: "Current model",
        currentDataDir: "Current data directory",
        listeningPort: "Listening port",
        runningConfig: "Running configuration",
        restart: "Restart service",
        restartHint: "Active work may be interrupted",
        restartConfirmTitle: "Restart with the saved configuration?",
        restartConfirmMessage: "{runs} active runs and {sessions} ACP sessions. Restart closes sessions and may interrupt active work and runs awaiting answers. Unsaved edits are lost; data is not migrated.",
        restartConfirm: "Restart",
        restarting: "Restarting and checking the service…",
        restartConfirmed: "Restart confirmed. Reconnecting…",
        restartFailed: "Restart was not confirmed. Run task-conductor status before retrying.",
        savePending: "Saving, please wait.",
        noCredentials: "No editable model credentials.",
        statusActive: "Active",
        statusPaused: "Paused",
        statusCompleted: "Complete",
        statusExpired: "Expired",
        statusCancelled: "Cancelled",
        statusRunning: "Running",
        statusSucceeded: "Succeeded",
        statusFailed: "Failed",
        statusInterrupted: "Interrupted",
        statusSkipped: "Skipped",
        statusTimedOut: "Timed out",
        statusWaitingInput: "Awaiting answer",
        statusPending: "Pending",
        statusAwaitingReview: "Awaiting review",
        statusStale: "Needs review",
        statusBlocked: "Blocked",
        statusMissing: "Missing",
        statusDisabled: "Disabled",
        statusInstalling: "Preparing",
        statusReady: "Ready",
        statusError: "Failed",
        currentProcess: "Current process",
        unknownError: "Request rejected; check the service state.",
        configurationChanged: "The configuration changed or the edit expired. Keep your draft and refresh.",
        uncertainOutcomes: "The task has runs with uncertain outcomes; future triggers cannot resume.",
        noFutureSchedule: "The task has no future trigger. Refresh to verify.",
        missingCredential: "A model credential is missing. Save it first.",
        endpointCredential: "Changing the model endpoint needs a new credential reference. Save the new key first.",
        credentialReferenced: "The saved configuration still uses this credential. Change it first.",
        localValidation: "Local validation failed: check the data directory, executor selection, and credential isolation.",
        configUnreadable: "Cannot read private configuration files. Inspect their format, ownership, and permissions offline.",
        publicationUncertain: "The save result is unconfirmed. Stop the service and inspect the configuration before saving again.",
        timeoutError: "Request timed out; try again.",
        unreachableError: "Cannot reach Task Conductor; check the service and retry.",
        responseError: "Cannot read the service response; refresh and retry.",
        operationUnconfirmed: "The operation result is unconfirmed; refresh before acting again.",
        restartUnknown: "Restart was not confirmed. Run task-conductor status before retrying.",
      },
    };

    const errorMessages = {
      "Configuration changed or the edit expired; reload before saving": "configurationChanged",
      "Task has uncertain external outcomes; future triggers require reconciliation": "uncertainOutcomes",
      "Task has no future schedule": "noFutureSchedule",
      "A referenced environment value is missing; prepare credentials or native configuration first": "missingCredential",
      "Changing the model endpoint requires a new credential reference; save the new key first": "endpointCredential",
      "The saved configuration still references this credential": "credentialReferenced",
      "Restart could not be confirmed; inspect private logs and use CLI status before retrying": "restartUnknown",
      "Local validation failed: check data directory, executor selection and credential isolation": "localValidation",
      "Cannot read private configuration files; inspect their format, ownership and permissions offline": "configUnreadable",
      "Publication was uncertain; stop the service and inspect configuration files before further saves": "publicationUncertain",
    };

    class ApiError extends Error {
      constructor(message, status = 0) { super(message); this.status = status; }
    }

    function mapping(t, key, values = {}) {
      const text = t(key);
      return text.replace(/\{(\w+)\}/g, (match, name) => name in values ? String(values[name]) : match);
    }

    function authHeaders() {
      return stored.token ? { Authorization: "Bearer " + stored.token } : {};
    }

    async function request(path, body, signal, method) {
      const verb = method ?? (body === undefined ? "GET" : "POST");
      const timeout = AbortSignal.timeout(path === "/restart" ? 60_000 : 15_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response;
      try {
        response = await fetch(API + path, {
          method: verb,
          headers: { ...authHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "same-origin", cache: "no-store", redirect: "error", signal: combined,
        });
      } catch {
        if (combined.aborted) throw new ApiError("timeoutError", 0);
        throw new ApiError("unreachableError", 0);
      }
      let result;
      try { result = await response.json(); }
      catch { throw new ApiError("responseError", response.status); }
      if (!response.ok) {
        if (response.status === 401) throw new ApiError("tokenInvalid", 401);
        const key = errorMessages[result?.error];
        throw new ApiError(key ?? (typeof result?.error === "string" && result.error ? result.error : "unknownError"), response.status);
      }
      if (result === null || typeof result !== "object" || !Object.hasOwn(result, "data")) throw new ApiError("responseError", 0);
      return result.data;
    }

    function errorText(t, error) {
      if (!error) return "";
      const known = ["timeoutError", "unreachableError", "responseError", "tokenInvalid", "tokenExpired",
        "unknownError", "operationUnconfirmed", "restartUnknown", "configurationChanged", "uncertainOutcomes",
        "noFutureSchedule", "missingCredential", "endpointCredential", "credentialReferenced", "localValidation",
        "configUnreadable", "publicationUncertain", "savePending"];
      return known.includes(error.message) ? t(error.message) : error.message;
    }

    function formatTime(value) {
      if (value == null || value === "") return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined,
        { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function scheduleText(t, schedule) {
      if (!schedule) return t("notConfigured");
      if (schedule.type === "now") return t("scheduleNow");
      if (schedule.type === "once") return mapping(t, "scheduleOnce", { time: formatTime(schedule.at) });
      return mapping(t, "scheduleCron", { expression: schedule.expression, timezone: schedule.timezone });
    }

    function nextText(t, task) {
      if (task.scheduleStatus === "paused") return t("paused") + (task.nextAt === null ? "" : " · " + mapping(t, "plannedAt", { time: formatTime(task.nextAt) }));
      return task.nextAt === null ? t("noFuture") : formatTime(task.nextAt);
    }

    function StatusBadge({ t, value }) {
      return h("span", { className: "tc-badge tc-" + (statusTones[value] ?? "neutral") }, statusLabel(t, value));
    }

    const statusKeys = {
      active: "statusActive", paused: "statusPaused", completed: "statusCompleted", expired: "statusExpired",
      cancelled: "statusCancelled", running: "statusRunning", succeeded: "statusSucceeded", failed: "statusFailed",
      interrupted: "statusInterrupted", skipped: "statusSkipped", timed_out: "statusTimedOut",
      waiting_input: "statusWaitingInput", pending: "statusPending", awaiting_review: "statusAwaitingReview",
      stale: "statusStale", blocked: "statusBlocked", missing: "statusMissing", disabled: "statusDisabled",
      installing: "statusInstalling", ready: "statusReady", error: "statusError",
    };

    function statusLabel(t, value) {
      const key = statusKeys[value];
      return key ? t(key) : value;
    }

    function Badge({ tone = "neutral", children }) {
      return h("span", { className: "tc-badge tc-" + tone }, children);
    }

    function Card({ title, description, actions, children, className = "" }) {
      return h("section", { className: "tc-card " + className },
        title || actions ? h("header", { className: "tc-card-head" },
          title ? h("h3", null, title) : null, actions ? h("div", { className: "tc-actions" }, actions) : null) : null,
        description ? h("p", { className: "tc-hint" }, description) : null,
        children);
    }

    function Facts({ items }) {
      return h("dl", { className: "tc-facts" }, items.map(([label, value], index) =>
        h("div", { key: index }, h("dt", null, label), h("dd", null, value == null ? "—" : value))));
    }

    function Table({ headers, rows }) {
      return h("div", { className: "tc-table-wrap" }, h("table", { className: "tc-table" },
        h("thead", null, h("tr", null, headers.map((label, index) => h("th", { key: index, scope: "col" }, label)))),
        h("tbody", null, rows.map((row, rowIndex) => h("tr", { key: rowIndex },
          row.map((cell, cellIndex) => h("td", { key: cellIndex }, cell == null ? "—" : cell)))))));
    }

    function Details({ title, value, children }) {
      return h("details", { className: "tc-details" },
        h("summary", null, title), children ?? h("pre", null, typeof value === "string" ? value : JSON.stringify(value, null, 2)));
    }

    function Field({ label, hint, children }) {
      return h("label", { className: "tc-field" }, h("span", { className: "tc-field-label" }, label),
        children, hint ? h("span", { className: "tc-hint" }, hint) : null);
    }

    function Input(props) {
      return h("input", { ...props, className: "tc-input " + (props.className ?? "") });
    }

    function Select({ value, onChange, children }) {
      return h("select", { className: "tc-input", value, onChange: event => onChange(event.target.value) }, children);
    }

    function Button({ children, onClick, disabled, tone = "", type = "button", busy = false, autoFocus = false }) {
      return h("button", { type, className: "tc-btn " + (tone ? "tc-btn-" + tone : ""), disabled: disabled || busy,
        onClick, autoFocus }, busy ? h("span", { className: "tc-spinner", "aria-hidden": true }) : null, children);
    }

    function Loading({ t }) {
      return h("p", { className: "tc-hint", role: "status" }, t("loading"));
    }

    function ErrorCard({ t, error, onRetry }) {
      return h(Card, null, h("p", { className: "tc-error", role: "alert" }, error),
        onRetry ? h("div", { className: "tc-actions" }, h(Button, { onClick: onRetry }, t("retry"))) : null);
    }

    function Pager({ t, page, after, go }) {
      if (!after && page.next === null) return null;
      return h("div", { className: "tc-pager" },
        h("span", { className: "tc-hint" }, mapping(t, "pageInfo", { page: Math.floor((after ?? 0) / 20) + 1, count: page.items.length })),
        h("div", { className: "tc-actions" },
          h(Button, { disabled: !after, onClick: () => go(Math.max(0, (after ?? 0) - 20)) }, t("previous")),
          h(Button, { disabled: page.next === null, onClick: () => go(page.next) }, t("nextPage"))));
    }

    function ConfirmDialog({ t, dialog, resolve }) {
      useEffect(() => {
        const listener = event => { if (event.key === "Escape") resolve(false); };
        document.addEventListener("keydown", listener);
        return () => document.removeEventListener("keydown", listener);
      }, [resolve]);
      return h("div", { className: "tc-dialog-backdrop", role: "presentation", onClick: () => resolve(false) },
        h("div", { className: "tc-dialog", role: "dialog", "aria-modal": "true", onClick: event => event.stopPropagation() },
          h("h2", null, dialog.title), h("p", null, dialog.message),
          h("div", { className: "tc-actions tc-end" },
            h(Button, { onClick: () => resolve(false), autoFocus: true }, t("cancel")),
            h(Button, { tone: dialog.danger ? "danger" : "primary", onClick: () => resolve(true) },
              dialog.confirmText ?? t("confirm")))));
    }

    function TasksPage({ t, api, route, navigate }) {
      const [page, setPage] = useState(null);
      const [error, setError] = useState(null);
      const [version, setVersion] = useState(0);
      useEffect(() => {
        let live = true;
        setError(null);
        api.request("/tasks?after=" + route.after).then(value => { if (live) setPage(value); })
          .catch(cause => { if (live) setError(cause); });
        return () => { live = false; };
      }, [api, route.after, version]);
      if (error) return h(ErrorCard, { t, error: errorText(t, error), onRetry: () => setVersion(value => value + 1) });
      if (!page) return h(Loading, { t });
      return h("div", { className: "tc-stack" },
        h("div", { className: "tc-page-head" },
          h("div", null, h("h2", null, t("listTitle")), h("p", { className: "tc-hint" }, t("listHint"))),
          h(Button, { onClick: () => setVersion(value => value + 1) }, t("refresh"))),
        !page.items.length ? h(Card, null, h("div", { className: "tc-empty" },
          h("strong", null, t("emptyTitle")), h("p", { className: "tc-hint" }, t("emptyHint")))) :
          h("ul", { className: "tc-list" }, page.items.map(task => h("li", { key: task.id },
            h("button", { type: "button", className: "tc-row",
              onClick: () => navigate({ kind: "task", id: task.id, after: 0, listAfter: route.after }) },
              h("span", { className: "tc-row-main" }, h("strong", null, task.name), h("span", { className: "tc-hint" }, task.id)),
              h("span", { className: "tc-row-meta" }, h(StatusBadge, { t, value: task.scheduleStatus }),
                h("span", { className: "tc-hint" }, scheduleText(t, task.schedule)),
                h("span", { className: "tc-hint" }, nextText(t, task))))))),
        h(Pager, { t, page, after: route.after, go: after => navigate({ kind: "tasks", after }) }));
    }

    function TaskEditor({ t, task, api, notify, onSaved }) {
      const schedule = task.input.schedule;
      const [name, setName] = useState(task.input.name);
      const [type, setType] = useState(schedule.type);
      const [at, setAt] = useState(schedule.type === "once" ? schedule.at : "");
      const [expression, setExpression] = useState(schedule.type === "cron" ? schedule.expression : "");
      const [timezone, setTimezone] = useState(schedule.type === "cron" ? schedule.timezone : "UTC");
      const [busy, setBusy] = useState(false);
      function readSchedule() {
        if (type === "now") return { type: "now" };
        if (type === "once") return { type: "once", at: at.trim() };
        return { type: "cron", expression: expression.trim(), timezone: timezone.trim() };
      }
      async function save(event) {
        event.preventDefault();
        if (busy) return;
        const patch = { taskId: task.id, expected: { name: task.input.name, schedule: task.input.schedule,
          scheduleStatus: task.scheduleStatus, nextAt: task.nextAt === null ? null : new Date(task.nextAt).toISOString() } };
        if (name.trim() !== task.input.name) patch.name = name.trim();
        const next = readSchedule();
        if (JSON.stringify(next) !== JSON.stringify(task.input.schedule)) patch.schedule = next;
        if (patch.name === undefined && patch.schedule === undefined) { notify(t("noChanges")); return; }
        setBusy(true);
        try { await api.request("/task-update", patch); notify(t("taskSaved"), "success"); onSaved(); }
        catch (error) { notify(errorText(t, error), "error"); }
        finally { setBusy(false); }
      }
      return h("form", { className: "tc-form", onSubmit: save },
        h(Field, { label: t("taskName") }, h(Input, { value: name, required: true, maxLength: 200,
          onChange: event => setName(event.target.value) })),
        h("fieldset", { className: "tc-fieldset" },
          h("legend", null, t("scheduleType")),
          h(Field, null, h(Select, { value: type, onChange: setType },
            schedule.type === "now" ? h("option", { value: "now" }, t("keepNow")) : null,
            h("option", { value: "once" }, t("scheduleOnceType")),
            h("option", { value: "cron" }, t("scheduleCronType")))),
          type === "once" ? h(Field, { label: t("triggerAt"), hint: t("triggerAtHint") },
            h(Input, { value: at, required: true, placeholder: "2026-12-01T09:00:00+08:00",
              onChange: event => setAt(event.target.value) })) : null,
          type === "cron" ? h(Field, { label: t("cronExpression") },
            h(Input, { value: expression, required: true, placeholder: "0 9 * * 1-5",
              onChange: event => setExpression(event.target.value) })) : null,
          type === "cron" ? h(Field, { label: t("timezone") },
            h(Input, { value: timezone, required: true, onChange: event => setTimezone(event.target.value) })) : null),
        h("p", { className: "tc-hint" }, t("taskEditHint")),
        h(Button, { type: "submit", tone: "primary", busy }, t("saveTask")));
    }

    function TaskPage({ t, api, route, navigate, confirm, notify }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [version, setVersion] = useState(0);
      useEffect(() => {
        let live = true;
        setError(null);
        Promise.all([api.request("/tasks/" + encodeURIComponent(route.id)),
          api.request("/runs?taskId=" + encodeURIComponent(route.id) + "&after=" + route.after)])
          .then(([task, runs]) => { if (live) setData({ task, runs }); })
          .catch(cause => { if (live) setError(cause); });
        return () => { live = false; };
      }, [api, route.id, route.after, version]);
      if (error) return h(ErrorCard, { t, error: errorText(t, error), onRetry: () => setVersion(value => value + 1) });
      if (!data) return h(Loading, { t });
      const { task, runs } = data;
      const editable = task.nextAt !== null && ["active", "paused"].includes(task.scheduleStatus);
      async function toggle() {
        const enabled = task.scheduleStatus === "paused";
        const accepted = await confirm({ title: t(enabled ? "resumeTitle" : "pauseTitle"),
          message: t(enabled ? "resumeMessage" : "pauseMessage"), confirmText: t(enabled ? "resume" : "pause") });
        if (!accepted) return;
        try {
          await api.request("/task-update", { taskId: task.id,
            expected: { name: task.input.name, schedule: task.input.schedule, scheduleStatus: task.scheduleStatus,
              nextAt: new Date(task.nextAt).toISOString() }, enabled });
          notify(t("scheduleUpdated"), "success"); setVersion(value => value + 1);
        } catch (cause) { notify(errorText(t, cause), "error"); }
      }
      return h("div", { className: "tc-stack" },
        h("button", { type: "button", className: "tc-back",
          onClick: () => navigate({ kind: "tasks", after: route.listAfter ?? 0 }) }, "← " + t("back")),
        h("div", { className: "tc-page-head" },
          h("div", null, h("h2", null, task.input.name), h("p", { className: "tc-hint" }, task.id)),
          h(StatusBadge, { t, value: task.scheduleStatus })),
        h(Card, { title: t("prompt") }, h("p", { className: "tc-prose" }, task.input.prompt)),
        h(Card, { title: t("triggerPlan") },
          h(Facts, { items: [[t("executionMode"), scheduleText(t, task.input.schedule)],
            [t("nextTrigger"), nextText(t, task)], [t("workspace"), task.workspace]] }),
          task.nextAt !== null && ["active", "paused"].includes(task.scheduleStatus)
            ? h("div", { className: "tc-actions" }, h(Button, { onClick: toggle }, t(task.scheduleStatus === "paused" ? "resume" : "pause")))
            : null,
          editable ? h(Details, { title: t("editConfig") },
            h(TaskEditor, { key: task.id + ":" + task.scheduleStatus + ":" + task.nextAt, t, task, api, notify,
              onSaved: () => setVersion(value => value + 1) })) : null),
        h(Card, { title: t("nodes"), description: t("nodesHint") },
          h(Table, { headers: [t("node"), t("executor"), t("dependsOn")],
            rows: task.input.nodes.map(node => [node.id, node.executorId, node.dependsOn.join("、") || t("none")]) }),
          h(Details, { title: t("taskMetadata"), value: { id: task.id, ...task.input, workspace: task.workspace, executors: task.executors } })),
        h(Card, { title: t("runHistory") },
          !runs.items.length ? h("p", { className: "tc-hint" }, t("noRuns") + " " + t("noRunsHint")) :
            h("ul", { className: "tc-list" }, runs.items.map(run => h("li", { key: run.id },
              h("button", { type: "button", className: "tc-row",
                onClick: () => navigate({ kind: "run", id: run.id, taskId: task.id, taskAfter: route.after, listAfter: route.listAfter ?? 0 }) },
                h("span", { className: "tc-row-main" }, h("strong", null, run.id),
                  h("span", { className: "tc-hint" }, t("acceptedNodes") + " " + run.accepted + " / " + run.total)),
                h("span", { className: "tc-row-meta" }, h(StatusBadge, { t, value: run.status }),
                  h("span", { className: "tc-hint" }, formatTime(run.createdAt)),
                  run.finishedAt ? h("span", { className: "tc-hint" }, formatTime(run.finishedAt)) : null))))),
          h(Pager, { t, page: runs, after: route.after,
            go: after => navigate({ kind: "task", id: task.id, after, listAfter: route.listAfter ?? 0 }) })));
    }

    function RunPage({ t, api, route, navigate }) {
      const [run, setRun] = useState(null);
      const [error, setError] = useState(null);
      const [version, setVersion] = useState(0);
      useEffect(() => {
        let live = true;
        setError(null);
        api.request("/runs/" + encodeURIComponent(route.id)).then(value => { if (live) setRun(value); })
          .catch(cause => { if (live) setError(cause); });
        return () => { live = false; };
      }, [api, route.id, version]);
      if (error) return h(ErrorCard, { t, error: errorText(t, error), onRetry: () => setVersion(value => value + 1) });
      if (!run) return h(Loading, { t });
      const accepted = run.nodes.filter(node => node.status === "succeeded").length;
      return h("div", { className: "tc-stack" },
        h("button", { type: "button", className: "tc-back",
          onClick: () => navigate({ kind: "task", id: run.taskId, after: route.taskAfter ?? 0, listAfter: route.listAfter ?? 0 }) }, "← " + t("back")),
        h("div", { className: "tc-page-head" },
          h("div", null, h("h2", null, t("runDetail")), h("p", { className: "tc-hint" }, run.id)),
          h(StatusBadge, { t, value: run.status })),
        h(Card, { title: t("runOverview") },
          h(Facts, { items: [[t("startTime"), formatTime(run.createdAt)],
            [t("endTime"), run.finishedAt ? formatTime(run.finishedAt) : t("noFuture")],
            [t("acceptedNodes"), accepted + " / " + run.nodes.length]] }),
          run.summary ? h("p", { className: "tc-prose" }, run.summary) : null,
          run.error ? h("p", { className: "tc-error", role: "alert" }, run.error) : null),
        h(Card, { title: t("nodes") },
          !run.nodes.length ? h("p", { className: "tc-hint" }, t("noRunsHint")) :
            run.nodes.map(node => h("details", { key: node.id, className: "tc-node" },
              h("summary", null, h("span", { className: "tc-row-main" },
                h("strong", null, node.definition.id), h("span", { className: "tc-hint" }, node.definition.executorId)),
                h(StatusBadge, { t, value: node.status })),
              h(Facts, { items: [[t("startTime"), formatTime(node.startedAt)],
                [t("dependsOn"), node.definition.dependsOn.join("、") || t("none")]] }),
              node.error ? h("p", { className: "tc-error" }, node.error) : null,
              node.result !== null ? h("div", { className: "tc-stack" },
                h("h4", null, t("acceptedDelivery")), h("pre", null, node.result),
                h(Details, { title: t("acceptance"), value: node.acceptance })) :
                h("p", { className: "tc-hint" }, t("noDelivery")),
              h(Details, { title: t("nodeDetail"), value: { definition: node.definition, workspace: node.workspace,
                inputFiles: node.inputFiles, deliveryId: node.deliveryId, deliveries: node.deliveries,
                baseline: node.baseline, resultFile: node.resultFile, sessionId: node.sessionId } }),
              node.turns.length ? h(Details, { title: t("turns") + " · " + node.turns.length },
                node.turns.map((turn, index) => h(Details, { key: index,
                  title: mapping(t, "turn", { index: index + 1 }), value: turn }))) : null))),
        run.questions.length ? h(Card, { title: t("questions"), description: t("questionsHint") },
          run.questions.map(question => {
            const expired = Math.min(Date.parse(question.expiresAt),
              question.sessionExpiresAt ? Date.parse(question.sessionExpiresAt) : Infinity) <= Date.now();
            const label = question.reply ? ["good", t("replied")] : expired ? ["neutral", t("expired")] :
              run.status !== "waiting_input" ? ["neutral", t("unanswered")] : ["warn", t("waitingAnswer")];
            return h("article", { key: question.id, className: "tc-question" },
              h(Badge, { tone: label[0] }, label[1]), h("h4", null, question.question),
              h("p", { className: "tc-hint" }, mapping(t, "questionNode", { node: question.nodeId ?? t("prompt"), time: formatTime(question.expiresAt) })),
              question.reply ? h("p", { className: "tc-prose" }, question.reply.answer) : null,
              h(Details, { title: t("nodeDetail"), value: { id: question.id, completedWork: question.completedWork,
                sessionExpiresAt: question.sessionExpiresAt } }));
          })) : null);
    }

    function ExecutorsPage({ t, api, confirm, notify }) {
      const [state, setState] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);
      const [version, setVersion] = useState(0);
      const [register, setRegister] = useState({ id: "", command: "", args: "[]", cwd: "" });
      const [registerOpen, setRegisterOpen] = useState(false);
      useEffect(() => {
        let live = true;
        setError(null);
        api.request("/executors").then(value => { if (live) setState(value); })
          .catch(cause => { if (live) setError(cause); });
        return () => { live = false; };
      }, [api, version]);
      useEffect(() => {
        if (!state?.executors.some(executor => executor.state === "installing")) return;
        const timer = setTimeout(() => setVersion(value => value + 1), 2000);
        return () => clearTimeout(timer);
      }, [state]);
      async function load(path, body, message) {
        if (busy) return;
        setBusy(true);
        try {
          const next = await api.request(path, body);
          setState(next);
          if (message) notify(t(message), "success");
        } catch (cause) { notify(errorText(t, cause), "error"); }
        finally { setBusy(false); }
      }
      async function unregister(executor) {
        if (!await confirm({ title: mapping(t, "unregisterTitle", { id: executor.id }), message: t("unregisterMessage"),
          confirmText: t("unregister"), danger: true })) return;
        await load("/executors/unregister", { id: executor.id }, "unregistered");
      }
      async function upgrade(executor) {
        if (!await confirm({ title: mapping(t, "updateTitle", { name: executor.id }), message: t("updateMessage"),
          confirmText: t("startUpdate") })) return;
        await load("/executors/upgrade", { id: executor.id }, "updateStarted");
      }
      async function submitRegister(event) {
        event.preventDefault();
        let args;
        try { args = JSON.parse(register.args); } catch { notify(t("argsInvalid"), "error"); return; }
        if (!Array.isArray(args) || args.some(item => typeof item !== "string")) { notify(t("argsInvalid"), "error"); return; }
        const input = { id: register.id.trim(), command: register.command.trim(), args,
          ...(register.cwd.trim() ? { cwd: register.cwd.trim() } : {}) };
        if (!await confirm({ title: mapping(t, "registerConfirmTitle", { id: input.id }),
          message: t("registerConfirmMessage"), confirmText: t("registerConfirm") })) return;
        await load("/executors/register", input, "registered");
        setRegister({ id: "", command: "", args: "[]", cwd: "" });
      }
      if (error) return h(ErrorCard, { t, error: errorText(t, error), onRetry: () => setVersion(value => value + 1) });
      if (!state) return h(Loading, { t });
      return h("div", { className: "tc-stack" },
        h("div", { className: "tc-page-head" },
          h("div", null, h("h2", null, t("executorTitle")), h("p", { className: "tc-hint" }, t("executorHint"))),
          h(Button, { busy, onClick: () => load("/executors/refresh", {}, "detected") }, t("refreshExecutors"))),
        h("div", { className: "tc-grid" }, state.executors.map(executor => {
          const label = executor.state === "missing" && executor.nativePath ? ["warn", "adapterPending"] : null;
          return h(Card, { key: executor.id, title: executor.id,
            actions: label ? h(Badge, { tone: label[0] }, t(label[1])) : h(StatusBadge, { t, value: executor.state }) },
            h(Facts, { items: [[t("launchPath"), executor.nativePath ?? t("notConfigured")],
              [t("adapter"), executor.adapterVersion ?? (executor.type === "opencode" ? t("nativeSupport") :
                executor.type === "custom" ? t("customProgram") : t("adapterPending"))]] }),
            executor.cwd ? h("p", { className: "tc-hint" }, mapping(t, "launchingCwd", { cwd: executor.cwd })) : null,
            executor.error ? h("p", { className: "tc-error" }, executor.error) : null,
            executor.state === "missing" ? h("p", { className: "tc-hint" }, t("installHint")) : null,
            executor.state === "disabled" ? h("p", { className: "tc-hint" }, t("disabledHint")) : null,
            h("div", { className: "tc-actions" },
              executor.type === "custom" ? h(Button, { tone: "danger", onClick: () => unregister(executor) }, t("unregister")) :
                executor.type === "opencode" ? h("span", { className: "tc-hint" }, t("nativeUpdate")) :
                  h(Button, { disabled: !executor.nativePath || ["disabled", "installing"].includes(executor.state),
                    onClick: () => upgrade(executor) }, t("updateAdapter"))));
        })),
        h("p", { className: "tc-hint" }, t("executorNote")),
        h(Card, null, h("button", { type: "button", className: "tc-disclosure",
          onClick: () => setRegisterOpen(value => !value), "aria-expanded": registerOpen },
          (registerOpen ? "▾ " : "▸ ") + t("registerExecutor")),
          registerOpen ? h("form", { className: "tc-form", onSubmit: submitRegister },
            h("p", { className: "tc-hint" }, t("registerHint")),
            h(Field, { label: t("executorId"), hint: t("executorIdHint") },
              h(Input, { value: register.id, required: true, onChange: event => setRegister({ ...register, id: event.target.value }) })),
            h(Field, { label: t("command"), hint: t("commandHint") },
              h(Input, { value: register.command, required: true, placeholder: "/absolute/path/to/executor",
                onChange: event => setRegister({ ...register, command: event.target.value }) })),
            h(Field, { label: t("args"), hint: t("argsHint") },
              h(Input, { value: register.args, onChange: event => setRegister({ ...register, args: event.target.value }) })),
            h(Field, { label: t("cwdLabel"), hint: t("cwdHint") },
              h(Input, { value: register.cwd, onChange: event => setRegister({ ...register, cwd: event.target.value }) })),
            h(Button, { type: "submit", tone: "primary", busy }, t("register"))) : null));
    }

    function fromSnapshot(saved) {
      const coordinator = saved.coordinator;
      return {
        provider: coordinator?.provider ?? "",
        model: coordinator?.model ?? "",
        baseUrl: coordinator?.baseUrl ?? "",
        apiKeyEnv: coordinator?.apiKeyEnv ?? "COORDINATOR_API_KEY",
        api: coordinator?.api ?? "openai-completions",
        contextWindow: coordinator?.contextWindow == null ? "" : String(coordinator.contextWindow),
        maxTokens: coordinator?.maxTokens == null ? "" : String(coordinator.maxTokens),
        reasoning: Boolean(coordinator?.reasoning),
        dataDir: saved.dataDir ?? "",
        port: saved.port == null ? "" : String(saved.port),
        tokenEnv: saved.tokenEnv ?? "",
        disabledExecutors: Array.isArray(saved.disabledExecutors) ? saved.disabledExecutors : [],
      };
    }

    function configFromForm(form) {
      const coordinator = form.provider ? { provider: form.provider, model: form.model.trim(),
        ...(form.provider === "openai-compatible" ? {
          baseUrl: form.baseUrl.trim(), apiKeyEnv: form.apiKeyEnv.trim(), api: form.api,
          contextWindow: Number(form.contextWindow), maxTokens: Number(form.maxTokens), reasoning: form.reasoning,
        } : {}) } : undefined;
      return { dataDir: form.dataDir.trim(), port: Number(form.port), tokenEnv: form.tokenEnv.trim(),
        disabledExecutors: ["pi", "codex", "claude", "opencode"].filter(type => form.disabledExecutors.includes(type)),
        ...(coordinator ? { coordinator } : {}) };
    }

    function providerName(t, id) {
      if (!id) return t("providerNone");
      if (id === "openai-compatible") return t("providerCompatible");
      return providers.find(([key]) => key === id)?.[1] ?? id;
    }

    function configText(t, key, value) {
      if (value == null) return t("notConfigured");
      if (key === "disabledExecutors") return value.length ? value.join("、") : t("none");
      if (key === "port") return value === 0 ? t("autoPort") : String(value);
      if (key === "coordinator") {
        return [providerName(t, value.provider), value.model,
          ...(value.provider === "openai-compatible" ? [value.baseUrl, t("apiKeyEnv") + ": " + value.apiKeyEnv,
            t("api") + ": " + value.api, t("contextWindow") + ": " + value.contextWindow,
            t("maxTokens") + ": " + value.maxTokens, t("reasoning") + ": " + (value.reasoning ? "✓" : "—")] : [])].join("\n");
      }
      return String(value);
    }

    function configLabel(t, key) {
      return { coordinator: t("coordinator"), dataDir: t("dataDir"), port: t("port"), tokenEnv: t("tokenEnv"),
        disabledExecutors: t("builtInExecutors") }[key] ?? key;
    }

    function SettingsPage({ t, api, notify, confirm, onHealth }) {
      const [snapshot, setSnapshot] = useState(null);
      const [form, setForm] = useState(null);
      const [preview, setPreview] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);
      const [credentialKey, setCredentialKey] = useState("");
      const [credentialValue, setCredentialValue] = useState("");
      const [version, setVersion] = useState(0);
      const revision = useRef(0);
      useEffect(() => {
        let live = true;
        setError(null);
        api.request("/settings").then(value => {
          if (!live) return;
          setSnapshot(value); setForm(fromSnapshot(value.saved)); setPreview(null);
        }).catch(cause => { if (live) setError(cause); });
        return () => { live = false; };
      }, [api, version]);
      function update(patch) {
        revision.current++;
        setForm(current => ({ ...current, ...patch })); setPreview(null);
      }
      async function saveSettings(config) {
        setBusy(true);
        try {
          const next = await api.request("/settings/config", { editToken: snapshot.editToken, config });
          setSnapshot(next); setForm(fromSnapshot(next.saved)); setPreview(null);
          notify(t("configSaved"), "success");
          if (onHealth) api.request("/status").then(onHealth).catch(() => {});
        } catch (cause) { notify(errorText(t, cause), "error"); }
        finally { setBusy(false); }
      }
      async function validate() {
        if (busy) return;
        setBusy(true);
        const current = revision.current;
        try {
          const result = await api.request("/settings/validate", { editToken: snapshot.editToken, config: configFromForm(form) });
          if (current === revision.current) setPreview(result);
        } catch (cause) { notify(errorText(t, cause), "error"); }
        finally { setBusy(false); }
      }
      async function saveCredential(key, action, value) {
        setBusy(true);
        try {
          const next = await api.request("/settings/credential",
            { editToken: snapshot.editToken, key, action, ...(action === "replace" ? { value } : {}) });
          setSnapshot(next); setForm(fromSnapshot(next.saved));
          setCredentialValue("");
          notify(t(action === "delete" ? "credentialDeleted" : "credentialSaved"), "success");
        } catch (cause) { notify(errorText(t, cause), "error"); }
        finally { setBusy(false); }
      }
      async function restart() {
        let status;
        try { status = await api.request("/status"); }
        catch (cause) { notify(errorText(t, cause), "error"); return; }
        if (!await confirm({ title: t("restartConfirmTitle"),
          message: mapping(t, "restartConfirmMessage", { runs: status.activeTaskRunIds.length, sessions: status.activeNodeRunIds.length }),
          confirmText: t("restartConfirm"), danger: true })) return;
        setBusy(true);
        notify(t("restarting"));
        try {
          await api.request("/restart", {});
          notify(t("restartConfirmed"), "success");
          setTimeout(async () => {
            for (let attempt = 0; attempt < 4; attempt++) {
              try {
                const value = await api.request("/status");
                onHealth?.(value); setVersion(current => current + 1); return;
              } catch { await new Promise(resolve => setTimeout(resolve, 1500)); }
            }
            notify(t("restartFailed"), "error");
          }, 1500);
        } catch (cause) { notify(errorText(t, cause), "error"); }
        finally { setBusy(false); }
      }
      if (error) return h(ErrorCard, { t, error: errorText(t, error), onRetry: () => setVersion(value => value + 1) });
      if (!snapshot || !form) return h(Loading, { t });
      const writeBlocked = snapshot.writeBlocked;
      const compatible = form.provider === "openai-compatible";
      const credentialReference = credentialEnv[form.provider] ?? (compatible ? form.apiKeyEnv : "");
      return h("div", { className: "tc-stack" },
        h("div", { className: "tc-page-head" },
          h("div", null, h("h2", null, t("settingsTitle")), h("p", { className: "tc-hint" }, t("settingsHint"))),
          h(Badge, { tone: snapshot.pendingRestart ? "warn" : "good" },
            t(snapshot.pendingRestart ? "configPending" : "configEffective"))),
        writeBlocked ? h("p", { className: "tc-error", role: "alert" }, t("writeBlocked")) : null,
        h(Card, { title: t("coordinator"), description: t("coordinatorHint") },
          h("div", { className: "tc-grid tc-grid-form" },
            h(Field, { label: t("provider") }, h(Select, { value: form.provider, onChange: value => update({ provider: value }) },
              providers.map(([id, label]) => h("option", { key: id, value: id }, label === "providerNone" ? t("providerNone") :
                label === "providerCompatible" ? t("providerCompatible") : label)))),
            h(Field, { label: t("model") }, h(Input, { value: form.model, disabled: !form.provider,
              required: Boolean(form.provider), placeholder: t("modelPlaceholder"),
              onChange: event => update({ model: event.target.value }) }))),
          compatible ? h("fieldset", { className: "tc-fieldset" }, h("legend", null, t("compatible")),
            h("div", { className: "tc-grid tc-grid-form" },
              h(Field, { label: t("baseUrl"), hint: t("baseUrlHint") },
                h(Input, { value: form.baseUrl, required: true, placeholder: "https://api.example.com/v1",
                  onChange: event => update({ baseUrl: event.target.value }) })),
              h(Field, { label: t("apiKeyEnv") },
                h(Input, { value: form.apiKeyEnv, required: true, onChange: event => update({ apiKeyEnv: event.target.value }) })),
              h(Field, { label: t("api") }, h(Select, { value: form.api, onChange: value => update({ api: value }) },
                h("option", { value: "openai-completions" }, t("apiCompletions")),
                h("option", { value: "openai-responses" }, t("apiResponses")))),
              h(Field, { label: t("contextWindow") },
                h(Input, { type: "number", min: 1, step: 1, value: form.contextWindow, required: true,
                  onChange: event => update({ contextWindow: event.target.value }) })),
              h(Field, { label: t("maxTokens") },
                h(Input, { type: "number", min: 1, step: 1, value: form.maxTokens, required: true,
                  onChange: event => update({ maxTokens: event.target.value }) })),
              h("div", { className: "tc-field" },
                h("label", { className: "tc-check" },
                  h("input", { type: "checkbox", checked: form.reasoning,
                    onChange: event => update({ reasoning: event.target.checked }) }),
                  t("reasoning"))))
          )
            : null,
          h("p", { className: "tc-hint" }, !form.provider ? t("noModelHint") :
            credentialReference ? mapping(t, "credentialRef", { key: credentialReference }) : null),
          h(Details, { title: t("advanced") },
            h("div", { className: "tc-grid tc-grid-form" },
              h(Field, { label: t("dataDir"), hint: t("dataDirHint") },
                h(Input, { value: form.dataDir, required: true, onChange: event => update({ dataDir: event.target.value }) })),
              h(Field, { label: t("port"), hint: t("portHint") },
                h(Input, { type: "number", min: 0, max: 65535, step: 1, value: form.port, required: true,
                  onChange: event => update({ port: event.target.value }) })),
              h(Field, { label: t("tokenEnv"), hint: t("tokenEnvHint") },
                h(Input, { value: form.tokenEnv, required: true, onChange: event => update({ tokenEnv: event.target.value }) }))),
            h("fieldset", { className: "tc-fieldset" }, h("legend", null, t("builtInExecutors")),
              h("div", { className: "tc-checks" }, ["pi", "codex", "claude", "opencode"].map(type =>
                h("label", { key: type, className: "tc-check" },
                  h("input", { type: "checkbox", checked: !form.disabledExecutors.includes(type),
                    onChange: event => update({ disabledExecutors: event.target.checked
                      ? form.disabledExecutors.filter(item => item !== type)
                      : [...form.disabledExecutors, type] }) }), type))),
              h("p", { className: "tc-hint" }, t("restartNote")))),
          h("div", { className: "tc-actions" }, h(Button, { onClick: validate, tone: "primary", busy, disabled: writeBlocked },
            t("preview")), h("span", { className: "tc-hint" }, t("restartNote")))),
        preview ? h(Card, { title: t(preview.changes.length ? "previewTitle" : "noPreviewChanges") },
          !preview.changes.length ? h("p", { className: "tc-hint" }, t("sameAsSaved")) : h("div", { className: "tc-stack" },
            h(Table, { headers: [t("field"), t("savedValue"), t("newValue")],
              rows: preview.changes.map(change => [configLabel(t, change.field),
                h("span", { className: "tc-prose" }, configText(t, change.field, change.before)),
                h("span", { className: "tc-prose" }, configText(t, change.field, change.after))]) }),
            preview.affectedTasks.length ? h("div", { className: "tc-warning" },
              h("strong", null, t("affectedTasks")),
              h("p", { className: "tc-prose" }, preview.affectedTasks.map(task => task.name + " · " + task.id).join("\n")),
              h("p", { className: "tc-hint" }, t("affectedHint"))) : null,
            h("p", { className: "tc-hint" }, t("localValid")),
            h("div", { className: "tc-actions" }, h(Button, { tone: "primary", busy, onClick: () => saveSettings(preview.config) },
              t("saveConfig")), h(Button, { onClick: () => setPreview(null) }, t("backToEdit"))))) : null,
        h(Card, { title: t("credentials"), description: t("credentialsHint") },
          !snapshot.credentials.length ? h("p", { className: "tc-hint" }, t("noCredentials")) :
            h(Table, { headers: [t("credentialKey"), t("savedBadge"), t("currentProcess"), ""],
              rows: snapshot.credentials.map(credential => [
                h("code", { key: "key" }, credential.key),
                h(Badge, { key: "saved", tone: credential.saved ? "good" : "neutral" },
                  t(credential.saved ? "savedBadge" : "unsetBadge")),
                credential.pendingRestart ? h(Badge, { key: "running", tone: "warn" }, t("runningBadge")) :
                  t(credential.running ? "savedBadge" : "unsetBadge"),
                h("div", { key: "actions", className: "tc-actions" },
                  h(Button, { disabled: writeBlocked, onClick: () => {
                    setCredentialKey(credential.key); setCredentialValue("");
                  } }, t(credential.saved ? "replace" : "set")),
                  credential.referenced ? h("span", { className: "tc-hint" }, t("inUse")) :
                    h(Button, { tone: "danger", disabled: !credential.saved || writeBlocked,
                      onClick: async () => {
                        if (!await confirm({ title: t("deleteTitle"),
                          message: mapping(t, "deleteMessage", { key: credential.key }), confirmText: t("delete"),
                          danger: true })) return;
                        await saveCredential(credential.key, "delete");
                      } }, t("delete"))),
              ]) })),
        h("form", { className: "tc-form tc-form-inline", onSubmit: async event => {
          event.preventDefault();
          await saveCredential(credentialKey.trim(), "replace", credentialValue);
        } },
          h(Field, { label: t("credentialKey"), hint: t("credentialKeyHint") },
            h(Input, { value: credentialKey, required: true, placeholder: "OPENAI_API_KEY",
              onChange: event => setCredentialKey(event.target.value) })),
          h(Field, { label: t("credentialValue"), hint: t("credentialValueHint") },
            h(Input, { type: "password", value: credentialValue, required: true, maxLength: 16384,
              onChange: event => setCredentialValue(event.target.value) })),
          h(Button, { type: "submit", tone: "primary", busy, disabled: writeBlocked }, t("saveCredential"))),
        h(Card, { title: t("serviceRestart"), description: t("serviceHint") },
          h(Facts, { items: [[t("currentModel"), snapshot.running.coordinator ? snapshot.running.coordinator.model : t("notConfigured")],
            [t("currentDataDir"), snapshot.running.dataDir],
            [t("listeningPort"), snapshot.running.port === 0 ? t("autoPort") : String(snapshot.running.port)]] }),
          h(Details, { title: t("runningConfig"), value: snapshot.running }),
          h("div", { className: "tc-actions" }, h(Button, { tone: "danger", busy, disabled: writeBlocked, onClick: restart },
            t("restart")), h("span", { className: "tc-hint" }, t("restartHint")))));
    }

    function ConsoleSection({ t }) {
      const [phase, setPhase] = useState("checking");
      const [health, setHealth] = useState(null);
      const [notice, setNotice] = useState(null);
      const [tab, setTab] = useState("tasks");
      const [route, setRoute] = useState({ kind: "tasks", after: 0 });
      const [dialog, setDialog] = useState(null);
      const [tokenInput, setTokenInput] = useState("");
      const [remember, setRemember] = useState(true);
      const [saved, setSaved] = useState(false);

      const notify = useCallback((message, tone = "info") => {
        setNotice(message ? { message, tone } : null);
      }, []);
      const unauthorized = useCallback(() => {
        stored.token = ""; setPhase("disconnected"); setHealth(null);
      }, []);
      const api = useMemo(() => ({
        async request(path, body, signal, method) {
          try { return await request(path, body, signal, method); }
          catch (error) {
            if (error.status === 401) { unauthorized(); notify(t("tokenInvalid"), "error"); }
            throw error;
          }
        },
      }), [t, unauthorized, notify]);
      const confirm = useCallback(options => new Promise(resolve => { setDialog({ ...options, resolve }); }), []);
      function closeDialog(result) {
        const current = dialog;
        setDialog(null);
        current?.resolve(result);
      }
      async function connect(event) {
        event.preventDefault();
        const candidate = tokenInput.trim();
        if (!candidate) return;
        stored.token = candidate; setPhase("checking");
        try {
          const value = await request("/status");
          setHealth(value); setPhase("connected"); setTokenInput(""); setNotice(null);
          try {
            if (remember) {
              await request("/session", { token: candidate }); setSaved(true);
            } else if (saved) {
              await request("/session", undefined, undefined, "DELETE"); setSaved(false);
            }
          } catch (error) { notify(errorText(t, error), "error"); }
        } catch (error) {
          stored.token = ""; setPhase("disconnected");
          setNotice({ message: errorText(t, error), tone: "error" });
        }
      }
      async function disconnect() {
        stored.token = ""; setPhase("disconnected"); setHealth(null); setNotice(null);
        if (!saved) return;
        try { await request("/session", undefined, undefined, "DELETE"); setSaved(false); }
        catch (error) { notify(errorText(t, error), "error"); }
      }
      useEffect(() => {
        let live = true;
        (async () => {
          let remembered = false;
          try {
            const session = await request("/session");
            if (!live) return;
            remembered = Boolean(session.saved);
            setSaved(remembered);
          } catch { /* 会话查询失败时继续尝试已有内存令牌 */ }
          if (!live) return;
          try {
            const value = await request("/status");
            if (!live) return;
            setHealth(value); setPhase("connected");
          } catch (error) {
            if (!live) return;
            stored.token = "";
            if (remembered) setSaved(false);
            setPhase("disconnected");
            if (error.status !== 401) setNotice({ message: errorText(t, error), tone: "error" });
          }
        })();
        return () => { live = false; };
      }, [t]);
      useEffect(() => {
        if (phase !== "connected") return;
        const timer = setInterval(() => {
          if (document.hidden) return;
          request("/status").then(setHealth).catch(error => {
            if (error.status === 401) { stored.token = ""; setToken(""); setPhase("disconnected"); }
          });
        }, 10_000);
        return () => clearInterval(timer);
      }, [phase]);
      const ready = health?.running && health?.storageHealthy;
      return h("section", { className: "tc-console" },
        h("style", null, styles),
        h("header", { className: "tc-head" },
          h("div", { className: "tc-brand" },
            h(IconMark, { size: 28 }),
            h("div", null, h("h2", null, t("title")), h("p", { className: "tc-hint" }, t("subtitle")))),
          h("div", { className: "tc-actions" },
            phase === "connected" && saved ? h(Badge, { tone: "neutral" }, t("tokenSaved")) : null,
            phase === "connected" ? h(Badge, { tone: ready ? "good" : "bad" }, t(ready ? "serviceRunning" : "serviceUnavailable")) : null,
            phase === "connected" ? h(Button, { onClick: disconnect }, t("disconnect")) : null)),
        phase === "connected" && health ? h("div", { className: "tc-statusline" },
          h("span", { className: "tc-hint" }, mapping(t, "activeRuns",
            { runs: health.activeTaskRunIds.length, sessions: health.activeNodeRunIds.length })),
          health.settings?.pendingRestart ? h(Badge, { tone: "warn" }, t("pendingRestart")) : null,
          health.settings?.writeBlocked ? h(Badge, { tone: "bad" }, t("writeBlocked")) : null) : null,
        notice ? h("div", { className: "tc-notice tc-notice-" + notice.tone, role: notice.tone === "error" ? "alert" : "status" },
          h("span", null, notice.message),
          h("button", { type: "button", className: "tc-quiet", "aria-label": t("close"),
            onClick: () => setNotice(null) }, "×")) : null,
        phase !== "connected" ? h("div", { className: "tc-connect" },
          h(Card, { title: t("connectTitle"), description: t("connectHint") },
            saved ? h("p", { className: "tc-hint" }, t("savedTokenHint")) : null,
            h("form", { className: "tc-form", onSubmit: connect, autoComplete: "off" },
              h(Field, { label: t("tokenLabel"), hint: t("tokenHint") },
                h(Input, { type: "password", value: tokenInput, required: true, maxLength: 256,
                  placeholder: t("tokenPlaceholder"), autoComplete: "off", spellCheck: false,
                  onChange: event => setTokenInput(event.target.value) })),
              h("p", { className: "tc-hint" }, t("tokenHelp")),
              h("label", { className: "tc-check tc-remember" },
                h("input", { type: "checkbox", checked: remember, onChange: event => setRemember(event.target.checked) }),
                t("rememberToken")),
              h("p", { className: "tc-hint" }, t("rememberHint")),
              h(Button, { type: "submit", tone: "primary", busy: phase === "checking" },
                t(phase === "checking" ? "connecting" : "connect"))))) :
          h("div", { className: "tc-stack" },
            h("nav", { className: "tc-tabs", role: "tablist" },
              [["tasks", "tasks"], ["executors", "executors"], ["settings", "settings"]].map(([id, label]) =>
                h("button", { key: id, type: "button", role: "tab", "aria-selected": tab === id,
                  className: tab === id ? "tc-tab tc-tab-active" : "tc-tab",
                  onClick: () => setTab(id) }, t(label)))),
            tab === "tasks" ? (route.kind === "task"
              ? h(TaskPage, { t, api, route, navigate: setRoute, confirm, notify })
              : route.kind === "run" ? h(RunPage, { t, api, route, navigate: setRoute })
                : h(TasksPage, { t, api, route, navigate: setRoute }))
              : tab === "executors" ? h(ExecutorsPage, { t, api, confirm, notify })
                : h(SettingsPage, { t, api, notify, confirm, onHealth: setHealth })),
        dialog ? h(ConfirmDialog, { t, dialog, resolve: closeDialog }) : null);
    }

    function IconMark({ size = 16 }) {
      return h("svg", { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": "true", className: "tc-mark" },
        h("rect", { x: 1, y: 1, width: 30, height: 30, rx: 8, fill: "currentColor", opacity: 0.14 }),
        h("path", { d: "M9 22.5 14.5 9l4 8 4.5-5.5", fill: "none", stroke: "currentColor", strokeWidth: 2.2,
          strokeLinecap: "round", strokeLinejoin: "round" }),
        h("circle", { cx: 9, cy: 22.5, r: 2, fill: "currentColor" }),
        h("circle", { cx: 23, cy: 11.5, r: 2, fill: "currentColor" }));
    }

    const styles = `
.tc-console { flex: 1; height: 100%; min-height: 0; overflow-y: auto; align-content: start; padding: 28px 32px 40px; box-sizing: border-box; display: grid; gap: 16px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.55; }
.tc-console * { box-sizing: border-box; }
.tc-console > :where(:not(style):not(.tc-dialog-backdrop)) { width: 100%; max-width: 1120px; margin-inline: auto; }
.tc-console h2, .tc-console h3, .tc-console h4, .tc-console p { margin: 0; }
.tc-console h2 { font-size: 18px; font-weight: 600; line-height: 1.35; }
.tc-head h2 { font-size: 22px; letter-spacing: -0.3px; }
.tc-console h3 { font-size: 14px; font-weight: 600; }
.tc-console h4 { font-size: 12px; font-weight: 600; }
.tc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.tc-brand { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.tc-brand .tc-mark { flex: none; color: var(--dsw-alias-brand-primary); margin-top: 1px; }
.tc-brand .tc-hint { margin-top: 3px; }
.tc-statusline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: -4px; }
.tc-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.tc-prose { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.tc-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; white-space: pre-wrap; }
.tc-notice { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); font-size: 12px; }
.tc-notice-error { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); }
.tc-notice-success { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, transparent); }
.tc-quiet { border: 0; background: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 15px; line-height: 1; }
.tc-stack { display: grid; gap: 12px; min-width: 0; }
.tc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.tc-grid-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tc-card { display: grid; gap: 12px; min-width: 0; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.tc-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tc-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tc-end { justify-content: flex-end; }
.tc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px; padding: 5px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.tc-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.tc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.tc-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-inverse, #fff); }
.tc-btn-primary:hover:not(:disabled) { opacity: 0.9; background: var(--dsw-alias-brand-primary); }
.tc-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent); background: transparent; }
.tc-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.tc-spinner { width: 10px; height: 10px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: tc-spin 0.8s linear infinite; }
@keyframes tc-spin { to { transform: rotate(360deg); } }
.tc-badge { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.6; white-space: nowrap; }
.tc-badge::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.tc-good { color: var(--dsw-alias-state-success-primary); }
.tc-warn { color: var(--dsw-alias-state-warn-primary); }
.tc-bad { color: var(--dsw-alias-state-error-primary); }
.tc-info { color: var(--dsw-alias-brand-primary); }
.tc-neutral { color: var(--dsw-alias-label-secondary); }
.tc-facts { display: grid; gap: 6px; margin: 0; }
.tc-facts > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; }
.tc-facts dt { color: var(--dsw-alias-label-secondary); }
.tc-facts dd { margin: 0; overflow-wrap: anywhere; }
.tc-field { display: grid; gap: 4px; min-width: 0; }
.tc-field-label { font-size: 12px; font-weight: 500; }
.tc-input { width: 100%; min-width: 0; min-height: 28px; padding: 3px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.tc-input:focus-visible, .tc-btn:focus-visible, .tc-tab:focus-visible, .tc-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.tc-input:disabled { opacity: 0.6; }
.tc-form { display: grid; gap: 10px; }
.tc-form-inline { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; }
.tc-fieldset { display: grid; gap: 8px; margin: 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }
.tc-fieldset legend { padding: 0 4px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.tc-checks { display: flex; flex-wrap: wrap; gap: 10px; }
.tc-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.tc-remember { margin-top: 2px; }
.tc-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.tc-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: inherit; text-align: left; font: inherit; cursor: pointer; }
.tc-row:hover { background: var(--dsw-alias-bg-layer-2); }
.tc-row-main { display: grid; gap: 2px; min-width: 0; }
.tc-row-main strong { overflow-wrap: anywhere; }
.tc-row-meta { display: grid; justify-items: end; gap: 2px; flex: none; max-width: 46%; text-align: right; }
.tc-table-wrap { max-width: 100%; overflow-x: auto; }
.tc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tc-table th { padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); text-align: left; font-weight: 500; white-space: nowrap; }
.tc-table td { padding: 7px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: top; overflow-wrap: anywhere; }
.tc-table tr:last-child td { border-bottom: 0; }
.tc-details { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; margin-top: 2px; }
.tc-details > summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.tc-details pre { max-height: 260px; overflow: auto; margin: 8px 0 0; padding: 8px; border-radius: 6px; background: var(--dsw-alias-bg-base); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
.tc-node { display: grid; gap: 8px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; }
.tc-node:first-of-type { border-top: 0; padding-top: 0; }
.tc-node > summary { display: flex; justify-content: space-between; gap: 10px; cursor: pointer; }
.tc-question { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); }
.tc-warning { padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent); border-radius: 8px; color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
.tc-empty { display: grid; gap: 4px; padding: 18px 8px; text-align: center; }
.tc-pager { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.tc-page-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.tc-back { justify-self: start; border: 0; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
.tc-console > .tc-connect { max-width: 540px; }
.tc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.tc-tab { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.tc-tab-active { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 500; }
.tc-disclosure { border: 0; background: none; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; font-weight: 500; text-align: left; padding: 0; cursor: pointer; }
.tc-dialog-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 40%)); }
.tc-dialog { width: min(420px, 100%); display: grid; gap: 12px; padding: 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-overlay); box-shadow: var(--dsw-elevation-prominent, 0 16px 48px rgb(0 0 0 / 25%)); }
.tc-dialog h2 { font-size: 15px; }
.tc-dialog p { font-size: 12px; white-space: pre-wrap; }
@media (max-width: 560px) { .tc-grid, .tc-form-inline { grid-template-columns: minmax(0, 1fr); } .tc-row { align-items: flex-start; } }
@media (max-width: 720px) { .tc-console { padding: 20px 16px 28px; } }
`;

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => {
          const disposeZh = ctx.locale.register("task-conductor", "zh", messages.zh);
          const disposeEn = ctx.locale.register("task-conductor", "en", messages.en);
          return () => { disposeZh(); disposeEn(); };
        });
        const t = ctx.locale.bind("task-conductor");
        function TaskConductorPanel() {
          const [, setRevision] = useState(0);
          useEffect(() => ctx.locale.subscribe(() => setRevision(value => value + 1)), []);
          return h(ConsoleSection, { t: ctx.locale.bind("task-conductor") });
        }
        // 与 a-options 工作台同级，排在其后；侧栏图标和主面板共用同一个 id。
        ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
          name: "sidebar.panellist", id: "task-conductor", order: 21, label: () => t("nav"),
        }, IconMark));
        ctx.slots.inject("main", () => ctx.slots.register({
          name: "main", key: "task-conductor",
        }, TaskConductorPanel));
      },
    };
  },
});
