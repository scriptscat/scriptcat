// ==UserScript==
// @name         userconfig
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  会在页面上显示用户配置,可以可视化的进行配置
// @author       You
// @background
// @grant GM_getValue
// @grant CAT_userConfig
// ==/UserScript==

/* ==UserConfig==
group1:
  configA:                                # 键值为group.config,例如本键为:group1.configA
    title: 配置A                          # 配置的标题
    description: 这是一个文本类型的配置     # 配置的描述内容
    type: text                            # 选项类型,如果不填写会根据数据自动识别
    default: 默认值                       # 配置的默认值
    min: 2                                # 文本最短2个字符
    max: 18                               # 文本最长18个字符
    password: true                        # 设置为密码
  configB:
    title: 配置B
    description: 这是一个选择框的配置
    type: checkbox
    default: true
  configC:
    title: 配置C
    description: 这是一个列表选择的配置
    type: select
    default: 1
    values: [1,2,3,4,5]
  configD:
    title: 配置D
    description: 这是一个动态列表选择的配置
    type: select
    bind: $cookies                       # 动态显示绑定的values,值是以$开头的key,value需要是一个数组
  configE:
    title: 配置E
    description: 这是一个多选列表的配置
    type: mult-select
    default: [1]
    values: [1,2,3,4,5]
  configF:
    title: 配置F
    description: 这是一个动态多选列表的配置
    type: mult-select
    bind: $cookies
  configG:
    title: 配置G
    description: 这是一个数字的配置
    type: number
    default: 11
    min: 10  # 最小值
    max: 16  # 最大值
    unit: 分 # 表示单位
  configH:
    title: 配置H
    description: 这是一个长文本类型的配置
    type: textarea
    default: 默认值
    rows: 6
---
group2:
  configX:
    title: 配置A
    description: 这是一个文本类型的配置
    default: 默认值
 ==/UserConfig== */

// 通过GM_info新方法获取UserConfig对象
const rawUserConfig = GM_info.userConfig;
// 定义一个对象暂存读取到的UserConfig值
const userConfig = {};
// 解构遍历读取UserConfig并赋缺省值
Object.entries(rawUserConfig).forEach(([mainKey, configs]) => {
  Object.entries(configs).forEach(([subKey, { default: defaultValue }]) => {
    userConfig[`${mainKey}.${subKey}`] = GM_getValue(`${mainKey}.${subKey}`, defaultValue)
  })
})

setInterval(() => {
  // 传统方法读取UserConfig，每个缺省值需要单独静态声明，修改UserConfig缺省值后代码也需要手动修改
  console.log(GM_getValue("group1.configA", "默认值"));
  console.log(GM_getValue("group1.configG", 11));
  // GM_info新方法读取UserConfig，可直接关联读取缺省值，无需额外修改
  console.log(userConfig["group1.configA"]);
  console.log(userConfig["group1.configG"]);
}, 5000)

// 打开用户配置
CAT_userConfig();