# vns-parent

变邻域的父代切换。挂在 Organon 的 `evolve` 服务上，只注册 `select` 和 `mutate`。

官方 incumbent 是这道题上 merit 最高的候选。merit 与 Organon 的 `population.js` 相同：正分越大越好，负分是越小越好，0 是失败。变异父代可以是这份 incumbent，也可以是档案里的另一份候选。子代要超过 incumbent 的 merit，才成为新的分数门槛。

循环、evaluator、`task.json`、预算、`allocate` 和 `#EVOLVE_START` / `#EVOLVE_END` 都仍由 Organon 负责。状态写在这次 run 的 `vns-parent/state.json`。

## 父代状态

每一档先吸收新的人口记录，再决定下一份候选从谁复制。

- 还有候选超过 incumbent：父代换成这份新代码，下一档做残差。
- 某一行为格里升和降都有，而且样本还不到 `m`：父代仍是 incumbent，下一档只对着这一格做残差。
- 父代有合法分数，小改动却得到 0：下一档只做保住合法输出的修改。连续两次仍是 0，进入硬化。
- 连续 `m` 个没有新格的持平，并且格子都已分开：硬化。下一档从 incumbent 复制出目录，但提示要求换掉标记里的结构，不沿当前算法做参数修改。
- 硬化后先做一对对照。不读算法的那一次开出新格或抬分，而读了算法的那一次没有，之后的打开保持不沿当前算法。
- 合法、但没有超过 incumbent 的新格，下一档从那一格出发做一次残差。再失败，这一格退役。

`m` 默认 3，`epsilon` 默认 0。`install(evolve, { m, epsilon })` 可以改。

## 接上

不要改 `dsh-evolve-loop`。这个目录自己是一个 Cordis 插件：`apply` 里调用 `install`，停用时卸下这两个 provider。

在要跑的 profile 里把本目录加进 bundle，插在 `dsh-evolve-loop` 之后，使它的注册盖住默认的 `fitness-proportional` 和 `candidate-builder`。`DSH_EVOLVE_FLOOR=1` 时不要同时挂这份插件，两套 select / mutate 会叠在同一个槽位上。
