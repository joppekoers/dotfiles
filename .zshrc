# Add deno completions to search path
if [[ ":$FPATH:" != *":/Users/joppe/completions:"* ]]; then export FPATH="/Users/joppe/completions:$FPATH"; fi
export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="robbyrussell"

export UPDATE_ZSH_DAYS=30

DISABLE_UNTRACKED_FILES_DIRTY="true"

# set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
HIST_STAMPS="dd/mm/yyyy"

# ZSH_TMUX_AUTOSTART=true
plugins=(cmdtime zsh-autosuggestions docker docker-compose z fzf-zsh-plugin kube-ps1)

source $ZSH/oh-my-zsh.sh

# remove all aliases set by system and oh-my-zsh
unalias -a

# kube-ps config
KUBE_PS1_SYMBOL_ENABLE=false
KUBE_PS1_PREFIX=
KUBE_PS1_SUFFIX=
# KUBE_PS1_NS_ENABLE=false
function kube_ps1_wrapped() {
	if [[ "$PWD" == *"celebratix"* ]]; then
		kube_ps1
	fi
}
alias k='kubectl'

# PROMPT="%(?:%{$fg_bold[green]%}➜ :%{$fg_bold[red]%}➜ )" # default
prompt_color=red
case $(hostname -s) in
laptop)
    prompt_color='green'
    ;;
server*)
    prompt_color='red'
    ;;
esac
PROMPT='%{$fg[${prompt_color}]%}%n@%m%}%{$fg[white]%}:%{$fg_bold[cyan]%}'
PROMPT+='%{$fg[cyan]%}${(%):-%~}%{$reset_color%} $(git_prompt_info)$(kube_ps1_wrapped)
%(?:%{$fg_bold[green]%}➜ :%{$fg_bold[red]%}➜ )%{$reset_color%}' # MAYBE use $ insead of ➜

ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg_bold[blue]%}git:(%{$fg[red]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%} "
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg[blue]%}) %{$fg[yellow]%}✗"
ZSH_THEME_GIT_PROMPT_CLEAN="%{$fg[blue]%})"


# Set preferred editor
export EDITOR='vim'
export VISUAL='vim'

# Fix language error in perl and others
export LANGUAGE="$LANG"
export LC_ALL="$LANG"

RESET='\e[0m'
PURPLE='\e[0;35m'

function add_path() {
	[ -d "$1" ] && export PATH="$1:$PATH"
}

# source file if it exists and is not empty (-s)
function source_if_exists() {
	[ -s "$1" ] && source "$1"
}

# run file if it exists and is not empty (-s)
function run_if_exists() {
	[ -s "$1" ] && . "$1"
}

function log_and_run() {
	echo $PURPLE$@$RESET
	eval "$@"
}

ROOT="$HOME/git/dotfiles"
if [ ! -d "$ROOT" ]; then
	echo "FATAL: dotfiles not found at $ROOT"
fi

if [ "$(uname -s)" = "Darwin" ]; then
	# Disable brew update before every package install
	# Manually update with: `brew update`
	export HOMEBREW_NO_AUTO_UPDATE=1

	add_path "/opt/homebrew/bin"
	# add_path "/usr/local/bin"
	# add_path "/opt/homebrew/opt/postgresql@15/bin"
	add_path "/opt/homebrew/opt/ruby/bin"
	add_path "/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
	add_path "/opt/homebrew/lib/ruby/gems/3.3.0/bin"
fi

# Aliases
if [ "$(uname -s)" = "Linux" ]; then
	alias ls="ls --color=auto"
	alias clip="xclip -selection c"
	alias ope="xdg-open"
	export SYSTEMD_EDITOR=vim
else
	alias ls="ls -G"
fi
alias rcp="rsync -ah --progress"
alias l="ls -Ahl"

alias sshfs1="sshfs -o follow_symlinks joppe@192.168.2.1: $HOME/server1/"
alias sshfsp1="sshfs -o follow_symlinks -p 10001 joppe@joppekoers.nl: $HOME/server1/"

alias leak="valgrind --leak-check=full --show-leak-kinds=definite,indirect,possible --track-origins=yes"

alias notes="code $HOME/git/notes"
alias dc="docker compose"

function json {
	if [ $# -eq 0 ]; then
		echo "Usage: json <string>"
		return 1
	fi
	result=$(echo "$1" | jq)
	if [ $? -ne 0 ]; then
		return
	fi
	echo "$result" | pbcopy
}

# quick navigator: https://github.com/agkozak/zsh-z
alias z='zshz 2>&1'

# GIT aliases and functions
# alias gf='git fetch --all --prune'
alias gcm='git commit -m'
function gch {
	if [ $# -eq 0 ]; then
		branch="$(git reflog | grep checkout | grep -o 'to .*$' | grep -o ' .*$' |  perl -ne 'print if ++$k{$_}==1' | fzf | tr -d '[:space:]')"
		git checkout "$branch"
		return
	fi
	git checkout $@
	echo git checkout $@ >> ~/.zsh_history
}
function gs {
	log_and_run git stash --include-untracked
}
function gp {
	log_and_run git stash pop
}
function gf {
	log_and_run git push --force-with-lease
}
function gam { # git amend all files
	if [ $# -eq 0 ]; then
		echo "Usage: gam <files>"
		return
	fi
	for file in $@; do
		git --no-pager diff --stat HEAD -- "$file"
		git add "$file"
	done
	git commit --amend --no-edit > /dev/null
}
function copygit {
	log_and_run find "$1" -mindepth 1 -maxdepth 1 -not -name .git -exec cp -rf {} $2 \\;
}
function grename { # git rename branch locally and remotely
	if [ $# -ne 1 ]; then
		echo "Renames local branch and push to remote"
		echo "Usage: grename <new_branch_name>"
		return 1
	fi
	oldbranch=$(git rev-parse --abbrev-ref HEAD)

	git branch -m $1					# Rename branch locally
	git push origin :$oldbranch			# Delete the old branch
	git push --set-upstream origin $1	# Push the new branch, set local branch to track the new remote
}
function gpullall() { # git pull all remote branches
	function git_branch_exists() {
		git show-ref --verify --quiet "refs/heads/$1"
	}

	branches=$(git branch -r | grep -v '\->' | sed "s,\x1B\[[0-9;]*[a-zA-Z],,g")
	for branch in $branches; do
		length=${#branch}
		if git_branch_exists "${branch#origin/}"; then
			continue
		fi
		if ((length > max_length)); then
			max_length=$length
		fi
	done

	for branch in $branches; do
		if git_branch_exists "${branch#origin/}"; then
			continue
		fi
		padding_length=$((max_length - ${#branch}))
		padding=$(printf '%*s' $padding_length)
		git branch --track "${branch#origin/}" "$branch"
		echo $branch$padding created
	done

	git fetch --all
	git pull --all
}
function gclean() { # git clean all untracked files and staged files
	log_and_run git stash --include-untracked -q
	log_and_run git stash drop -q
}
function gchh { # git checkout history
	checkout_history=$(git reflog | grep checkout | grep -o 'to .*$' | grep -o ' .*$' |  perl -ne 'print if ++$k{$_}==1' | tail -r | tail -n 15)
	if [ $# -ne 1 ]; then
		echo "$checkout_history" | nl -w2 -s' '
		return
	fi

	# if parameter is a number, checkout that number
	if [[ $1 =~ ^[0-9]+$ ]]; then
		selected=$(echo "$checkout_history" | sed -n "$1p")
		log_and_run git checkout$selected
		return
	fi

	echo "Usage: gchh [number]"
}
function gm { # git merge latest version of branch into current branch
	if [ $# -ne 1 ]; then
		echo "Usage: gm <branch>"
		return
	fi

	log_and_run git checkout $1 && \
	log_and_run git pull && \
	log_and_run git checkout - && \
	log_and_run git merge $1 --no-ff --no-edit
}
_gm_complete() {
  _arguments '1: :->branch' && return 0
  if [[ $state == branch ]]; then
    compadd $(git for-each-ref --format='%(refname:short)' refs/heads/)
  fi
}
compdef _gm_complete gm

function gr { # git rebase on top of latest version of branch
	if [ $# -ne 1 ]; then
		echo "Usage: gr <branch>"
		return 1
	fi

	current_branch=$(git rev-parse --abbrev-ref HEAD)
	if [ "$current_branch" = "$1" ]; then
		echo "Cannot rebase on the same branch: $current_branch"
		return 1
	fi

	log_and_run git checkout $1 && \
	log_and_run git pull && \
	log_and_run git checkout - && \
	log_and_run git rebase $1
}
_gr_complete() {
  _arguments '1: :->branch' && return 0
  if [[ $state == branch ]]; then
	compadd $(git for-each-ref --format='%(refname:short)' refs/heads/)
  fi
}
compdef _gr_complete gr

function gl { # git log with pretty format
	git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(cyan)%ad %ar%C(reset)%C(auto)%d%C(reset)%n''          %C(white)%s%C(reset) %C(dim white)- %an%C(reset)' --date=format:'%a, %d %b %H:%M'
}


ghlogs() {
  # Fetch the latest GitHub runs
  local runs
  runs=$(gh run list --limit 10 --json databaseId,status,displayTitle -q '.[] | "\(.databaseId) \(.status) \(.displayTitle)"' | grep in_progress)

  if [[ -z "$runs" ]]; then
    echo "No recent GitHub Actions runs found."
    return 1
  fi

  # Count number of runs
  local count
  count=$(echo "$runs" | wc -l)

  local selected_run

  if [[ "$count" -eq 1 ]]; then
    # Only one run
    selected_run=$(echo "$runs" | awk '{print $1}')
  else
    # Multiple runs — use fzf if available, otherwise fallback to manual selection
    if command -v fzf >/dev/null 2>&1; then
      selected_run=$(echo "$runs" | fzf --prompt="Select GitHub Action: " | awk '{print $1}')
    else
      echo "Multiple runs found:"
      select line in $runs; do
        selected_run=$(echo "$line" | awk '{print $1}')
        break
      done
    fi
  fi

  if [[ -n "$selected_run" ]]; then
    echo "Showing logs for run ID: $selected_run"
    gh run view "$selected_run" --log
  else
    echo "No run selected."
    return 1
  fi
}

# VSCode aliases
alias c="code ."
function cz {
	project=$(z -e "$1")
	if [ -z "$project" ]; then
		echo "Path not found"
		return 1
	fi
	log_and_run code "$project"
}

# Rider aliases
alias r="rider ."
function rz {
	project=$(z -e "$1")
	if [ -z "$project" ]; then
		echo "Path not found"
		return 1
	fi
	log_and_run rider "$project"
}

alias ..2="cd ../.."
alias ..3="cd ../../.."
alias ..4="cd ../../../.."
alias ..5="cd ../../../../.."
alias ..6="cd ../../../../../.."
# alias netstat="netstat -tulpn | grep :"

function drop {
	if [ $# -ne 1 ]; then
		echo "Usage: drop <file>"
		return 1
	fi

	log_and_run curl -X POST -F "file=@$1" https://joppekoers.nl/drop/up
}

function mkcd {
	log_and_run mkdir "$1" && cd "$1";
}

function profile {
	if [ $# -ne 1 ]; then
		echo "Usage: profile <program>"
		return 1
	fi

	TMP=$(mktemp -d)
	valgrind -q --tool=callgrind --callgrind-out-file=$TMP/callgrind.out $@
	gprof2dot --format=callgrind --output=$TMP/out.dot $TMP/callgrind.out
	dot -Gdpi=400 -Tpng $TMP/out.dot -o profile.png
	dot -Tsvg $TMP/out.dot -o profile.svg
	rm -f $TMP/out.dot
}

# This rsync remove is way faster than rm -r
function rrm {
	emptydir=$(mktemp -d)
	for dir in "$@"; do
		rsync -a --delete $emptydir/ "$dir"
		rm -rf "$dir"
	done
	rm -rf $emptydir
}

function loop {
	while true; do
		$@
	done
}

function drs {
	log_and_run "docker stop $1; docker start $1; docker logs -f -n 10000 $1"
}

function dps {
	log_and_run 'docker container list --no-trunc --format "table {{.Names}}\\t{{.Status}}\\t{{.Command}}\\t{{.Ports}}"'
}

# batcat
export MANPAGER="sh -c 'col -bx | bat -l man -p'"
if [ "$(uname -s)" = "Linux" ]; then
	export BAT_PAGER="less -RF"
fi

add_path "$HOME/.local/bin"

# Only ignore duplicate terminal commands, save the ones prefixed with whitespace
export HISTCONTROL=ignoredups

function preexec() {}
function precmd() {}

# allow * matcing in terminal
setopt no_bare_glob_qual

# disable rm * conformation prompt
setopt rmstarsilent

# Fix slowness of pastes (meant for zsh-syntax-highlighting.zsh but still works)
pasteinit() {
	OLD_SELF_INSERT=${${(s.:.)widgets[self-insert]}[2,3]}
	zle -N self-insert url-quote-magic # I wonder if you'd need `.url-quote-magic`?
}
pastefinish() {
	zle -N self-insert $OLD_SELF_INSERT
}
zstyle :bracketed-paste-magic paste-init pasteinit
zstyle :bracketed-paste-magic paste-finish pastefinish

# disable escaping characters in url / url-quote-magic
zstyle :urlglobber url-other-schema

# Bun
source_if_exists "$HOME/.bun/_bun"
export BUN_INSTALL="$HOME/.bun"
add_path "$BUN_INSTALL/bin"

# Volta
# export VOLTA_HOME="$HOME/.volta"
# add_path "$VOLTA_HOME/bin"

# npm
add_path "$HOME/.npm-global/bin"

# pnpm
if [ "$(uname -s)" = "Linux" ]; then
	export PNPM_HOME="$HOME/.pnpm-global"
else
	export PNPM_HOME="$HOME/Library/pnpm"
fi
add_path "$PNPM_HOME"

# fzf
source_if_exists "$HOME/.fzf.zsh"

# dotnet
add_path /usr/local/share/dotnet/dotnet
add_path "$HOME/.dotnet/tools"
add_path ".vscode-dotnet-sdk/.dotnet"
export DOTNET_ROOT=$HOME/.vscode-dotnet-sdk/.dotnet/dotnet

# android
export ANDROID_HOME=$HOME/Library/Android/sdk
add_path "$ANDROID_HOME/emulator"
add_path "$ANDROID_HOME/platform-tools"

# Java
if which jenv > /dev/null; then eval "$(jenv init -)"; fi
add_path "$HOME/.jenv/shims"
add_path "/opt/homebrew/opt/openjdk@17/bin"

# Go
add_path "$HOME/go/bin"

# Deno
if which deno > /dev/null; then
	. "$HOME/.deno/env"
	autoload -Uz compinit
	compinit
fi;

# Terraform
autoload -U +X bashcompinit && bashcompinit
complete -o nospace -C /opt/homebrew/bin/terraform terraform

# Set .zsh_history max lines
HISTSIZE=10000000
SAVEHIST=10000000

setopt EXTENDED_HISTORY     # Write the history file in the ":start:elapsed;command" format.
setopt HIST_REDUCE_BLANKS   # Remove superfluous blanks from each command
setopt no_hist_ignore_space # Do not ignore commands that start with a space


# De duplicating paths inside $PATH https://www.linuxjournal.com/content/removing-duplicate-path-entries
export PATH=$(echo $PATH | awk -v RS=: -v ORS=: '!($0 in a) {a[$0]; print $0}' | sed 's/:$//')
